import { DEMO_JOBS } from "@/lib/demo/jobs";
import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

/**
 * Injects the sample Malta jobs dataset when no live source is configured
 * (spec §48). Always reports status DEMO — never LIVE — so nothing
 * downstream can mistake it for a real employer feed. Every job ingested
 * through this adapter is tagged source = "demo" and, in the UI, clearly
 * labelled as sample data.
 */
export class DemoJobSourceAdapter extends BaseJobSourceAdapter {
  readonly key = "demo";
  readonly name = "Demo Malta jobs (sample data)";
  readonly kind = "internal" as const;

  getStatus(): "DEMO" {
    return "DEMO";
  }

  protected isConfigured(): boolean {
    return true;
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    return DEMO_JOBS as unknown as RawSourceJob[];
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const job = raw as unknown as (typeof DEMO_JOBS)[number];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      sourceJobId: job.id,
      title: job.title,
      companyName: job.companyName,
      companyLogo: job.companyLogo,
      description: job.description,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      skills: job.skills,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      location: `${job.locality}, Malta`,
      locality: job.locality,
      remoteType: job.remoteType,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      industry: job.industry,
      postedAt: new Date(now - job.postedDaysAgo * dayMs).toISOString(),
      expiresAt: new Date(now + job.expiresInDays * dayMs).toISOString(),
      applicationMethod: job.applicationMethod,
      applicationProvider: job.applicationProvider,
      autoApplySupported: job.autoApplySupported,
      raw,
    };
  }

  getApplicationUrl(): string | null {
    return null;
  }

  getApplicationMethod(raw: RawSourceJob) {
    return (raw as unknown as (typeof DEMO_JOBS)[number]).applicationMethod;
  }

  getCompany(raw: RawSourceJob) {
    const job = raw as unknown as (typeof DEMO_JOBS)[number];
    return { name: job.companyName };
  }

  async checkJobStatus() {
    return "active" as const;
  }
}
