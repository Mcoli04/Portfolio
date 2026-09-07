import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * SmartRecruiters' public postings API
 * (https://api.smartrecruiters.com/v1/companies/{companyId}/postings) is
 * unauthenticated. Configured via SMARTRECRUITERS_COMPANY_IDS.
 */
export class SmartRecruitersAdapter extends BaseJobSourceAdapter {
  readonly key = "smartrecruiters";
  readonly name = "SmartRecruiters";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.smartrecruitersCompanyIds.length > 0;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const companyId of integrationConfig.smartrecruitersCompanyIds) {
      const res = await fetch(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companyId)}/postings?country=mt`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = Array.isArray(data?.content) ? data.content : [];
      results.push(...jobs.map((job: RawSourceJob) => ({ ...job, __companyId: companyId })));
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const location = raw.location as { city?: string; country?: string } | undefined;
    return {
      sourceJobId: String(raw.id),
      title: String(raw.name ?? "Untitled role"),
      companyName: String((raw.company as { name?: string })?.name ?? raw.__companyId ?? "Unknown employer"),
      description: String((raw.jobAd as { sections?: { jobDescription?: { text?: string } } })?.sections?.jobDescription?.text ?? ""),
      skills: [],
      location: location?.city ? `${location.city}, Malta` : "Malta",
      postedAt: String(raw.releasedDate ?? raw.createdOn ?? new Date().toISOString()),
      applicationUrl: typeof (raw.applyUrl as { url?: string })?.url === "string" ? (raw.applyUrl as { url: string }).url : undefined,
      applicationMethod: "ats",
      applicationProvider: "smartrecruiters",
      autoApplySupported: true,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return (raw.applyUrl as { url?: string })?.url ?? null;
  }

  getApplicationMethod(): "ats" {
    return "ats";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String((raw.company as { name?: string })?.name ?? raw.__companyId ?? "Unknown employer") };
  }
}
