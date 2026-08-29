import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Ashby's public job board API
 * (https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}) is
 * unauthenticated. Configured via ASHBY_JOB_BOARD_NAMES.
 */
export class AshbyAdapter extends BaseJobSourceAdapter {
  readonly key = "ashby";
  readonly name = "Ashby";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.ashbyJobBoardNames.length > 0;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const boardName of integrationConfig.ashbyJobBoardNames) {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardName)}`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const job of jobs) {
        const location = String(job.location ?? "");
        if (/malta/i.test(location)) results.push({ ...job, __boardName: boardName });
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.__boardName ?? "Unknown employer"),
      description: String(raw.descriptionPlain ?? raw.description ?? ""),
      skills: [],
      location: String(raw.location ?? "Malta"),
      remoteType: raw.isRemote ? "remote" : undefined,
      employmentType: mapEmploymentType(raw.employmentType as string | undefined),
      postedAt: String(raw.publishedAt ?? new Date().toISOString()),
      applicationUrl: typeof raw.jobUrl === "string" ? raw.jobUrl : undefined,
      applicationMethod: "ats",
      applicationProvider: "ashby",
      autoApplySupported: true,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.jobUrl === "string" ? raw.jobUrl : null;
  }

  getApplicationMethod(): "ats" {
    return "ats";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.__boardName ?? "Unknown employer") };
  }
}

function mapEmploymentType(value: string | undefined) {
  switch (value) {
    case "FullTime":
      return "full_time" as const;
    case "PartTime":
      return "part_time" as const;
    case "Contract":
      return "contract" as const;
    case "Temporary":
      return "temporary" as const;
    case "Intern":
      return "internship" as const;
    default:
      return undefined;
  }
}
