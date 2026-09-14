import { integrationConfig } from "@/lib/config";
import { normalizeText } from "@/lib/dedupe";
import { htmlToPlainText } from "@/lib/html-to-text";
import { MALTA_LOCALITIES } from "@/lib/malta-locations";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

interface GreenhouseOffice {
  name?: string;
  location?: string;
}

const NORMALIZED_MALTA_LOCALITIES = MALTA_LOCALITIES.map((locality) => ({
  original: locality,
  normalized: normalizeText(locality),
}));

/** Whole-word/phrase containment: normalized both sides, space-padded so "malta" doesn't match inside an unrelated longer token. */
function containsNormalizedPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${phrase} `);
}

/**
 * Structured Malta match for one candidate string (a Greenhouse job's own
 * `location.name`, or one `offices[]` entry's `name`/`location` — never the
 * free-text job description). Returns the matched Malta locality's original
 * casing when a specific locality is recognized, "Malta" when only the
 * country name matches, or null when neither is found.
 */
function matchMaltaLocationString(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  for (const { original, normalized: normalizedLocality } of NORMALIZED_MALTA_LOCALITIES) {
    if (containsNormalizedPhrase(normalized, normalizedLocality)) return original;
  }
  if (containsNormalizedPhrase(normalized, "malta")) return "Malta";
  return null;
}

/**
 * Decides whether a raw Greenhouse job is Malta-relevant, and if so, which
 * specific locality (when recognized). Deliberately checks ONLY three
 * structured Greenhouse fields the employer explicitly set when configuring
 * the posting/office in their Greenhouse account:
 *   - job.location.name       (the posting's own location string)
 *   - job.offices[].name      (the Greenhouse "office" record's display name)
 *   - job.offices[].location  (that office's location string)
 * The job description/content (raw.content) is never consulted, so a
 * remote/worldwide role whose description merely mentions Malta is
 * correctly excluded rather than misclassified as Malta-based.
 */
function classifyMaltaRelevance(raw: RawSourceJob): { isMalta: boolean; locality: string | null } {
  const candidates: string[] = [];

  const location = raw.location as { name?: string } | undefined;
  if (typeof location?.name === "string") candidates.push(location.name);

  const offices = Array.isArray(raw.offices) ? (raw.offices as GreenhouseOffice[]) : [];
  for (const office of offices) {
    if (typeof office.name === "string") candidates.push(office.name);
    if (typeof office.location === "string") candidates.push(office.location);
  }

  let isMalta = false;
  let locality: string | null = null;
  for (const candidate of candidates) {
    const match = matchMaltaLocationString(candidate);
    if (!match) continue;
    isMalta = true;
    if (match !== "Malta" && !locality) locality = match;
  }

  return { isMalta, locality };
}

/**
 * Greenhouse publishes a public, unauthenticated job-board JSON API per
 * company: https://boards-api.greenhouse.io/v1/boards/{token}/jobs. No
 * secret key is required to read it — what's missing until an employer
 * partnership exists is simply the list of board tokens to poll
 * (GREENHOUSE_BOARD_TOKENS). Malta-based postings are identified from each
 * job's own structured location/office fields (see classifyMaltaRelevance).
 *
 * autoApplySupported is false: Greenhouse's public Job Board API is
 * read-only, and the real submission channel (GreenhouseApplicationProvider,
 * src/lib/applications/providers/greenhouse-provider.ts) stays
 * NOT_CONFIGURED until a specific employer grants Apply API access — until
 * then a swipe on a Greenhouse job safely resolves to manual_required via
 * browser-automation assistance or a direct link to the real posting, never
 * a fabricated "submitted".
 */
export class GreenhouseAdapter extends BaseJobSourceAdapter {
  readonly key = "greenhouse";
  readonly name = "Greenhouse";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.greenhouseBoardTokens.length > 0;
  }

  /**
   * Fetches every configured board. A single board responding with a
   * non-ok status throws (rather than being silently skipped), which fails
   * this whole call — ingestJobs() then records the error and, critically,
   * skips closed-job reconciliation for this run rather than risking
   * wrongly deactivating jobs from a board whose fetch actually failed.
   * With a small number of boards this all-or-nothing behavior is the
   * simplest way to guarantee that safety property; if this grows to many
   * boards, per-board fetch isolation would be a reasonable follow-up.
   */
  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const token of integrationConfig.greenhouseBoardTokens) {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) {
        throw new Error(`Greenhouse board "${token}" responded ${res.status}`);
      }
      const data = await res.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const job of jobs) {
        const { isMalta } = classifyMaltaRelevance(job);
        if (isMalta) results.push(job);
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const { locality } = classifyMaltaRelevance(raw);
    const location = String((raw.location as { name?: string })?.name ?? "");
    return {
      sourceJobId: String(raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String((raw.company_name as string) ?? "Unknown employer"),
      // raw.content is the employer's rich-text HTML description (present
      // because fetchJobsLive requests ?content=true) — normalize it to
      // plain text here so nothing downstream ever stores or displays raw
      // markup/entities.
      description: htmlToPlainText(String(raw.content ?? "")),
      skills: [],
      location: location || "Malta",
      locality: locality ?? undefined,
      postedAt: String(raw.updated_at ?? raw.first_published ?? new Date().toISOString()),
      applicationUrl: typeof raw.absolute_url === "string" ? raw.absolute_url : undefined,
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      autoApplySupported: false,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.absolute_url === "string" ? raw.absolute_url : null;
  }

  getApplicationMethod(): "ats" {
    return "ats";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String((raw.company_name as string) ?? "Unknown employer") };
  }

  async checkJobStatus(sourceJobId: string) {
    // Greenhouse removes closed postings from the board feed entirely, so a
    // 404 on direct lookup means the role has closed. Not currently called
    // by the ingestion loop (which now uses reconciliation against the full
    // board fetch instead — see ingestJobs()); kept as a still-correct,
    // cheaper single-job liveness check other callers can use.
    for (const token of integrationConfig.greenhouseBoardTokens) {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${sourceJobId}`,
        { next: { revalidate: 0 } }
      );
      if (res.ok) return "active" as const;
    }
    return "closed" as const;
  }
}
