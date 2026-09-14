import { integrationConfig } from "@/lib/config";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * EURES (the EU's job mobility portal) requires registration as an
 * authorised data consumer before its API can be queried. This adapter is
 * shaped for that integration but reports NOT_CONFIGURED, and fetches
 * nothing, until an EURES API key is supplied and access is authorised.
 */
export class EuresAdapter extends BaseJobSourceAdapter {
  readonly key = "eures";
  readonly name = "EURES (EU job mobility network)";
  readonly kind = "eu_network" as const;

  protected isConfigured(): boolean {
    return integrationConfig.eures;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const apiKey = process.env.EURES_API_KEY;
    const res = await fetch(
      "https://ec.europa.eu/eures/api/v1/jobs/search?countryCode=MT",
      { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 0 } }
    );
    if (!res.ok) throw new Error(`EURES API responded ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    return {
      sourceJobId: String(raw.id),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.employerName ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: [],
      location: "Malta",
      postedAt: String(raw.publicationDate ?? new Date().toISOString()),
      expiresAt: typeof raw.expiryDate === "string" ? raw.expiryDate : undefined,
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
