import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

export interface EmployerFeedConfig {
  /** One entry per employer that has agreed to publish a machine-readable feed. */
  feeds: { employerName: string; feedUrl: string; format: "json" }[];
}

/**
 * Generic adapter for employer-provided vacancy feeds (a JSON endpoint an
 * employer maintains and has explicitly authorised the platform to poll).
 * Configuration lives in job_sources.config in the database (set by an
 * admin per §39) rather than an env var, since each employer's feed URL is
 * a business relationship, not a platform-wide secret.
 */
export class EmployerFeedAdapter extends BaseJobSourceAdapter {
  readonly key = "employer_feed";
  readonly name = "Employer-provided feeds";
  readonly kind = "employer_feed" as const;

  constructor(private readonly config: EmployerFeedConfig | null) {
    super();
  }

  protected isConfigured(): boolean {
    return Boolean(this.config?.feeds?.length);
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const feeds = this.config?.feeds ?? [];
    const results: RawSourceJob[] = [];
    for (const feed of feeds) {
      try {
        const res = await fetch(feed.feedUrl, { next: { revalidate: 0 } });
        if (!res.ok) continue;
        const data = await res.json();
        const jobs = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];
        for (const job of jobs) {
          results.push({ ...job, __employerName: feed.employerName });
        }
      } catch (error) {
        console.error(`[employer_feed] failed to fetch feed for ${feed.employerName}`, error);
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.id ?? raw.jobId),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.__employerName ?? raw.company ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : [],
      location: typeof raw.location === "string" ? raw.location : "Malta",
      postedAt: String(raw.postedAt ?? new Date().toISOString()),
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
      applicationUrl: typeof raw.applicationUrl === "string" ? raw.applicationUrl : undefined,
      applicationEmail: typeof raw.applicationEmail === "string" ? raw.applicationEmail : undefined,
      applicationMethod: raw.applicationEmail ? "email" : "manual",
      autoApplySupported: Boolean(raw.applicationEmail),
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.applicationUrl === "string" ? raw.applicationUrl : null;
  }

  getApplicationMethod(raw: RawSourceJob) {
    return raw.applicationEmail ? ("email" as const) : ("manual" as const);
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.__employerName ?? raw.company ?? "Unknown employer") };
  }
}
