import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Greenhouse publishes a public, unauthenticated job-board JSON API per
 * company: https://boards-api.greenhouse.io/v1/boards/{token}/jobs. No
 * secret key is required to read it — what's missing until an employer
 * partnership exists is simply the list of board tokens to poll
 * (GREENHOUSE_BOARD_TOKENS). Malta-based postings are filtered from each
 * board's full job list by matching office/location text.
 */
export class GreenhouseAdapter extends BaseJobSourceAdapter {
  readonly key = "greenhouse";
  readonly name = "Greenhouse";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.greenhouseBoardTokens.length > 0;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const token of integrationConfig.greenhouseBoardTokens) {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const job of jobs) {
        const location = String(job.location?.name ?? "");
        if (/malta/i.test(location)) results.push(job);
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const location = String((raw.location as { name?: string })?.name ?? "");
    return {
      sourceJobId: String(raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String((raw.company_name as string) ?? "Unknown employer"),
      description: String(raw.content ?? ""),
      skills: [],
      location: location || "Malta",
      postedAt: String(raw.updated_at ?? raw.first_published ?? new Date().toISOString()),
      applicationUrl: typeof raw.absolute_url === "string" ? raw.absolute_url : undefined,
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      autoApplySupported: true,
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
    // 404 on direct lookup means the role has closed.
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
