import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Lever's public postings API (https://api.lever.co/v0/postings/{site}) is
 * unauthenticated. Configured via LEVER_SITE_IDS — the Lever site slug for
 * each partnered employer.
 */
export class LeverAdapter extends BaseJobSourceAdapter {
  readonly key = "lever";
  readonly name = "Lever";
  readonly kind = "ats" as const;

  protected isConfigured(): boolean {
    return integrationConfig.leverSiteIds.length > 0;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const site of integrationConfig.leverSiteIds) {
      const res = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`, {
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const jobs = await res.json();
      if (!Array.isArray(jobs)) continue;
      for (const job of jobs) {
        const location = String(job.categories?.location ?? "");
        if (/malta/i.test(location)) results.push({ ...job, __siteId: site });
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const categories = raw.categories as { location?: string; team?: string; commitment?: string } | undefined;
    return {
      sourceJobId: String(raw.id),
      title: String(raw.text ?? "Untitled role"),
      companyName: String(raw.__siteId ?? "Unknown employer"),
      description: String((raw.descriptionPlain as string) ?? (raw.description as string) ?? ""),
      skills: [],
      location: categories?.location || "Malta",
      industry: categories?.team,
      postedAt: raw.createdAt
        ? new Date(Number(raw.createdAt)).toISOString()
        : new Date().toISOString(),
      applicationUrl: typeof raw.applyUrl === "string" ? raw.applyUrl : (raw.hostedUrl as string),
      applicationMethod: "ats",
      applicationProvider: "lever",
      autoApplySupported: true,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return (raw.applyUrl as string) ?? (raw.hostedUrl as string) ?? null;
  }

  getApplicationMethod(): "ats" {
    return "ats";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.__siteId ?? "Unknown employer") };
  }
}
