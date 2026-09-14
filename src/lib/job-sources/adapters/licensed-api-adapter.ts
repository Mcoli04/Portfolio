import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

export interface LicensedApiConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Generic adapter for a licensed third-party job board API (a paid data
 * license, e.g. a Malta job board that sells API access). Disabled by
 * default — an admin must supply a base URL and license key via
 * job_sources.config before this reports LIVE.
 */
export class LicensedApiAdapter extends BaseJobSourceAdapter {
  readonly key = "licensed_api";
  readonly name = "Licensed job board API";
  readonly kind = "licensed_api" as const;

  constructor(private readonly config: LicensedApiConfig | null) {
    super();
  }

  protected isConfigured(): boolean {
    return Boolean(this.config?.baseUrl && this.config?.apiKey);
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const res = await fetch(`${this.config!.baseUrl}/jobs?country=MT`, {
      headers: { Authorization: `Bearer ${this.config!.apiKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`Licensed job API responded ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.jobs) ? data.jobs : [];
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.company ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : [],
      location: typeof raw.location === "string" ? raw.location : "Malta",
      postedAt: String(raw.postedAt ?? new Date().toISOString()),
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
      applicationUrl: typeof raw.applyUrl === "string" ? raw.applyUrl : undefined,
      applicationMethod: "manual",
      autoApplySupported: false,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.applyUrl === "string" ? raw.applyUrl : null;
  }

  getApplicationMethod(): "manual" {
    return "manual";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.company ?? "Unknown employer") };
  }
}
