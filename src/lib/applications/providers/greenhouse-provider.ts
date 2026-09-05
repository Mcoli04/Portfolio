import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { ApplicationForm, CandidateApplicationData, SubmissionResult } from "../types";
import { extractGreenhouseBoardToken, mapGreenhouseFormResponse, type GreenhouseJobDetailResponse } from "./greenhouse-form-mapping";

/**
 * Greenhouse's public Job Board API is read-only. Submitting an
 * application programmatically requires Greenhouse's "Job Board Apply
 * API", which is only granted per-employer after a partner review — there
 * is no platform-wide credential for it. Until a specific employer grants
 * that access (recorded in job_sources/application_providers config), this
 * provider stays NOT_CONFIGURED and routes matching jobs to browser
 * automation or manual application instead of pretending to submit.
 *
 * getApplicationForm() below is real, read-only form inspection — it does
 * NOT change that story. isConfigured() still returns false, so
 * selectProvider() in engine.ts never selects this provider for a real
 * job (getStatus() !== "LIVE"), and submitApplication() (inherited from
 * BaseApplicationProvider) refuses before submitLive() is ever reached
 * regardless of what a form inspection finds. The only way this method
 * runs today is a direct unit test or the engine's test-only `ctx.provider`
 * override — never the live apply flow.
 */
export class GreenhouseApplicationProvider extends BaseApplicationProvider {
  readonly key = "greenhouse";
  readonly name = "Greenhouse";

  protected isConfigured(): boolean {
    return false;
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

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("Greenhouse Job Board Apply API is not provisioned for any employer yet.");
  }
}
