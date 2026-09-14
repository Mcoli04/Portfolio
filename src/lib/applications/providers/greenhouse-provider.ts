import type { Job } from "@/lib/types/database";
import { getGreenhouseJobBoardApiKey, integrationConfig } from "@/lib/config";
import { BaseApplicationProvider } from "./base";
import type { ApplicationForm, CandidateApplicationData, SubmissionResult } from "../types";
import { extractGreenhouseBoardToken, mapGreenhouseFormResponse, type GreenhouseJobDetailResponse } from "./greenhouse-form-mapping";

/**
 * Resolves per-board Greenhouse submission credentials. Injectable so tests
 * can exercise real authorization/denial logic deterministically, without
 * real env vars (which are frozen at process start — see config.ts) and
 * without ever needing a real credential. Production code never overrides
 * this; provider-registry.ts constructs GreenhouseApplicationProvider with
 * zero arguments, always getting defaultGreenhouseCredentialResolver below.
 */
export interface GreenhouseCredentialResolver {
  /** Coarse, provider-wide: is ANY board both allowlisted and keyed. */
  hasAnyAuthorizedBoard(): boolean;
  /**
   * The dedicated key for exactly this board, or undefined if this board
   * is not authorized OR has no key of its own — both conditions are
   * required independently; there is no shared/master/fallback key.
   */
  getApiKey(boardToken: string): string | undefined;
}

const defaultGreenhouseCredentialResolver: GreenhouseCredentialResolver = {
  hasAnyAuthorizedBoard() {
    return integrationConfig.greenhouseAuthorizedBoardTokens.some((token) => Boolean(getGreenhouseJobBoardApiKey(token)));
  },
  getApiKey(boardToken: string) {
    // The allowlist is authoritative, not just key presence: a stray
    // leftover GREENHOUSE_JOB_BOARD_API_KEY_* env var for a token that was
    // never deliberately added to GREENHOUSE_AUTHORIZED_BOARD_TOKENS must
    // never silently authorize that board.
    if (!integrationConfig.greenhouseAuthorizedBoardTokens.includes(boardToken)) return undefined;
    return getGreenhouseJobBoardApiKey(boardToken);
  },
};

/**
 * Greenhouse's public Job Board API is read-only for job discovery.
 * Submitting an application requires Greenhouse's "Job Board Apply API" —
 * a per-BOARD, employer-issued credential, never a platform-wide one. No
 * employer is authorized by default: both GREENHOUSE_AUTHORIZED_BOARD_TOKENS
 * and that same board's own GREENHOUSE_JOB_BOARD_API_KEY_<TOKEN> must be
 * deliberately set (see config.ts) before this provider does anything for
 * that specific board. Every other Greenhouse board — including every one
 * currently ingested for Malta — stays exactly as before: NOT_CONFIGURED /
 * ineligible, resolving to manual_required with its real application_url.
 *
 * getApplicationForm() below is unchanged: real, read-only form inspection,
 * unauthenticated, available for every Greenhouse job regardless of
 * submission authorization — inspecting a form is not the same question as
 * being allowed to submit to it.
 *
 * Authorization is checked in two independent places for the SAME job,
 * deliberately redundant:
 *   1. isJobEligible() — consulted by channel-selection.ts's selectChannel()
 *      BEFORE this provider is ever selected for a specific job. This is
 *      what keeps auto_apply_supported accurate per board (not just
 *      per-provider) and keeps an unauthorized board from ever reaching
 *      submitLive() through the normal swipe-to-apply path.
 *   2. submitLive() itself re-derives the board token and re-checks
 *      authorization + credential presence again, independently, before
 *      constructing any request — so even a bypass of (1) (e.g. the
 *      engine's test-only ctx.provider override) still cannot reach
 *      Greenhouse's API for an unauthorized board. Unauthorized/unkeyed
 *      boards make ZERO network requests to Greenhouse.
 */
export class GreenhouseApplicationProvider extends BaseApplicationProvider {
  readonly key = "greenhouse";
  readonly name = "Greenhouse";

  constructor(private readonly credentials: GreenhouseCredentialResolver = defaultGreenhouseCredentialResolver) {
    super();
  }

  protected isConfigured(): boolean {
    return this.credentials.hasAnyAuthorizedBoard();
  }

  isJobEligible(job: { applicationUrl: string | null | undefined }): boolean {
    const boardToken = extractGreenhouseBoardToken(job.applicationUrl ?? null);
    if (!boardToken) return false;
    return Boolean(this.credentials.getApiKey(boardToken));
  }

  /**
   * Fetches ONLY the public, unauthenticated Job Board API's per-job
   * detail endpoint with `?questions=true` (developers.greenhouse.io/job-board.html)
   * and maps its declared fields into our ApplicationForm shape. No
   * credentials, no employer-issued token — the board token is derived
   * from the job's own public application_url. Any failure (no
   * recognizable board token, network error, non-2xx response, malformed
   * JSON) returns null, identical to "no form" for every other provider —
   * never a fabricated or partially-guessed form.
   */
  async getApplicationForm(job: Job): Promise<ApplicationForm | null> {
    const boardToken = extractGreenhouseBoardToken(job.application_url);
    if (!boardToken) return null;

    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(job.source_job_id)}?questions=true`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data !== "object" || !Array.isArray((data as GreenhouseJobDetailResponse).questions)) {
        return null;
      }
      return mapGreenhouseFormResponse(data as GreenhouseJobDetailResponse);
    } catch (error) {
      console.error("[greenhouse] getApplicationForm fetch failed", error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Builds the Job Board Apply API request body directly from
   * candidate.answers, keyed exactly as resolveFormFields() in engine.ts
   * already keys them — the SAME field.id Greenhouse itself declared on
   * the read side (greenhouse-form-mapping.ts sets FormField.id = the raw
   * Greenhouse field name, including "first_name"/"last_name"/"email"/
   * "phone" for identity fields, which match Greenhouse's documented write
   * field names exactly). This is deliberately NOT transformed, prefixed,
   * or reshaped for custom screening questions: Greenhouse's public docs
   * do not establish that the write side expects a different name than
   * what the read side already gave us, so inventing a transformation
   * (e.g. assuming a "question_<id>" prefix) would be guessing at a
   * contract that isn't documented. If a field name is ever wrong,
   * Greenhouse's own 422 response resolves safely to manual_required
   * below — never a silent no-op, never a fabricated success.
   *
   * "resume"/"cover_letter"-role fields are type "file" and are never
   * present in candidate.answers (engine.ts's resolveFormFields() handles
   * file-role fields separately via the already-prepared document text/
   * buffer) — handled here directly from the candidate object instead.
   */
  private buildSubmissionBody(candidate: CandidateApplicationData): Record<string, unknown> {
    const body: Record<string, unknown> = { ...candidate.answers };

    if (candidate.resumeFileBuffer) {
      body.resume_content = candidate.resumeFileBuffer.toString("base64");
      body.resume_content_filename = candidate.resumeFileName ?? "resume.pdf";
    } else if (candidate.resumeText) {
      body.resume_text = candidate.resumeText;
    }

    if (candidate.coverLetterText) {
      // This platform only ever produces cover-letter TEXT, never a file,
      // so the plaintext field is the only one that applies here —
      // resume_content's file-upload counterpart has no cover-letter
      // equivalent to guess at.
      body.cover_letter_text = candidate.coverLetterText;
    }

    return body;
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    const boardToken = extractGreenhouseBoardToken(job.application_url);
    const apiKey = boardToken ? this.credentials.getApiKey(boardToken) : undefined;

    // Independent, authoritative re-check — see the class doc comment.
    // Nothing below this point runs, and no request is ever sent, unless
    // this specific job's own board is both allowlisted and keyed.
    if (!boardToken || !apiKey) {
      return {
        success: false,
        manualRequired: true,
        errorMessage: "This employer's Greenhouse board has not been authorized for automatic submission.",
      };
    }

    const body = this.buildSubmissionBody(candidate);
    // Never log or persist apiKey anywhere — used only in this header.
    const authorizationHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

    let res: Response;
    try {
      res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${encodeURIComponent(job.source_job_id)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authorizationHeader,
          },
          body: JSON.stringify(body),
        }
      );
    } catch (error) {
      // Network-level failure — genuinely unknown outcome, not a
      // candidate-fixable data problem, so this is "failed" (retryable),
      // not "manual_required".
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : "Network error submitting to Greenhouse.",
      };
    }

    if (res.status === 401 || res.status === 403) {
      // Sqwer's own credential problem (revoked/invalid key) — not
      // something the candidate can fix by visiting the real posting, so
      // this is "failed", never "manual_required". Never includes apiKey.
      return {
        success: false,
        errorMessage: `Greenhouse rejected the submission credential for board "${boardToken}" (status ${res.status}).`,
      };
    }

    if (res.status === 422 || res.status === 400) {
      // A genuine, candidate-completable data problem (most likely the
      // form changed between inspection and submission) — the real
      // application_url still works, so this is "manual_required".
      const errorBody = await res.text().catch(() => "");
      return {
        success: false,
        manualRequired: true,
        errorMessage: `Greenhouse rejected this application: ${errorBody || `status ${res.status}`}`,
      };
    }

    if (!res.ok) {
      // Any other non-2xx (5xx, etc.) — treat as a transient/unexpected
      // failure, not something the candidate can complete manually right now.
      return { success: false, errorMessage: `Greenhouse responded with an unexpected status ${res.status}.` };
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      // A 2xx with no parseable body is not a confirmed success — nothing
      // to point to as evidence Greenhouse actually recorded it.
      return { success: false, errorMessage: "Greenhouse returned a 2xx response with no parseable body." };
    }

    // Deliberately never extracts a specific field (e.g. "id") as
    // externalApplicationId: Greenhouse's public documentation does not
    // establish a canonical success-response identifier field, and
    // guessing one risks asserting a false external reference. The full
    // raw response is preserved as confirmationDetails — the genuine audit
    // trail — without inventing a specific shape for it. This should be
    // revisited (a real identifier field added here) only once confirmed
    // against an actual observed Greenhouse response, never assumed.
    return {
      success: true,
      confirmationDetails: data as Record<string, unknown>,
    };
  }
}
