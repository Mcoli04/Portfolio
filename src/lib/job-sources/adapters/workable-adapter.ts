import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Workable's public widget API (https://apply.workable.com/api/v1/widget/accounts/{subdomain})
 * lists open jobs without authentication. Configured via
 * WORKABLE_ACCOUNT_SUBDOMAINS — each partnered employer's Workable account subdomain.
 */
export class WorkableAdapter extends BaseJobSourceAdapter {
  readonly key = "workable";
  readonly name = "Workable";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.workableAccountSubdomains.length > 0;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const subdomain of integrationConfig.workableAccountSubdomains) {
      const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(subdomain)}`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      for (const job of jobs) {
        const location = `${job.city ?? ""} ${job.country ?? ""}`;
        if (/malta/i.test(location)) results.push({ ...job, __subdomain: subdomain });
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.shortcode ?? raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.__subdomain ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: [],
      location: `${raw.city ?? ""}, Malta`.replace(/^,\s*/, ""),
      employmentType: mapEmploymentType(raw.employment_type as string | undefined),
      postedAt: String(raw.published_on ?? new Date().toISOString()),
      applicationUrl: typeof raw.url === "string" ? raw.url : undefined,
      applicationMethod: "ats",
      applicationProvider: "workable",
      autoApplySupported: true,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.url === "string" ? raw.url : null;
  }

  getApplicationMethod(): "ats" {
    return "ats";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.__subdomain ?? "Unknown employer") };
  }
}

function mapEmploymentType(value: string | undefined) {
  switch (value) {
    case "full":
      return "full_time" as const;
    case "part":
      return "part_time" as const;
    case "contract":
      return "contract" as const;
    case "temporary":
      return "temporary" as const;
    case "internship":
      return "internship" as const;
    default:
      return undefined;
  }
}
