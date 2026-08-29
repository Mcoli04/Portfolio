import type { IntegrationStatus } from "@/lib/types/database";
import type { JobLiveStatus, JobSourceAdapter, JobSourceKind, RawSourceJob } from "./types";

/**
 * Shared base for adapters. A subclass decides whether it is configured
 * (`isConfigured()`); until it is, `fetchJobs()` returns an empty array and
 * `getStatus()` reports NOT_CONFIGURED. This means new sources can be wired
 * in later purely by supplying credentials/config — no adapter needs to be
 * rewritten to "go live".
 */
export abstract class BaseJobSourceAdapter implements JobSourceAdapter {
  abstract readonly key: string;
  abstract readonly name: string;
  abstract readonly kind: JobSourceKind;

  /** Subclasses report true once real credentials/config are present. */
  protected abstract isConfigured(): boolean;

  /** Real fetch implementation, only ever called when isConfigured() is true. */
  protected abstract fetchJobsLive(): Promise<RawSourceJob[]>;

  getStatus(): IntegrationStatus {
    return this.isConfigured() ? "LIVE" : "NOT_CONFIGURED";
  }

  async fetchJobs(): Promise<RawSourceJob[]> {
    if (!this.isConfigured()) return [];
    try {
      return await this.fetchJobsLive();
    } catch (error) {
      console.error(`[job-source:${this.key}] fetchJobs failed`, error);
      return [];
    }
  }

  async getJob(_sourceJobId: string): Promise<RawSourceJob | null> {
    return null;
  }

  async checkJobStatus(_sourceJobId: string): Promise<JobLiveStatus> {
    return "unknown";
  }

  abstract normalizeJob(raw: RawSourceJob): ReturnType<JobSourceAdapter["normalizeJob"]>;
  abstract getApplicationUrl(raw: RawSourceJob): string | null;
  abstract getApplicationMethod(raw: RawSourceJob): ReturnType<JobSourceAdapter["getApplicationMethod"]>;
  abstract getCompany(raw: RawSourceJob): { name: string; logo?: string; website?: string };
}
