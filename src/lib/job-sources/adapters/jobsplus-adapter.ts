import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Jobsplus (Malta's public employment service, jobsplus.gov.mt) does not
 * publish an open vacancy API — access requires a formal data-sharing
 * agreement. This adapter defines the real integration shape so it can be
 * switched on the moment such an agreement and API key exist; until then it
 * honestly reports NOT_CONFIGURED and contributes zero jobs.
 */
export class JobsPlusAdapter extends BaseJobSourceAdapter {
  readonly key = "jobsplus";
  readonly name = "Jobsplus (Malta public employment service)";
  readonly kind = "government" as const;

  protected isConfigured(): boolean {
    return integrationConfig.jobsplus;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const apiKey = process.env.JOBSPLUS_API_KEY;
    const res = await fetch("https://www.jobsplus.gov.mt/api/vacancies", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`Jobsplus API responded ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.vacancies) ? data.vacancies : [];
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.id ?? raw.vacancyId),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.employerName ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : [],
      location: typeof raw.locality === "string" ? raw.locality : undefined,
      locality: typeof raw.locality === "string" ? raw.locality : undefined,
      postedAt: String(raw.postedAt ?? new Date().toISOString()),
      expiresAt: typeof raw.closingDate === "string" ? raw.closingDate : undefined,
      applicationUrl: typeof raw.applicationUrl === "string" ? raw.applicationUrl : undefined,
      applicationMethod: "manual",
      autoApplySupported: false,
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.applicationUrl === "string" ? raw.applicationUrl : null;
  }

  getApplicationMethod(): "manual" {
    return "manual";
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.employerName ?? "Unknown employer") };
  }
}
