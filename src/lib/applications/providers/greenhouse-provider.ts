import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Greenhouse's public Job Board API is read-only. Submitting an
 * application programmatically requires Greenhouse's "Job Board Apply
 * API", which is only granted per-employer after a partner review — there
 * is no platform-wide credential for it. Until a specific employer grants
 * that access (recorded in job_sources/application_providers config), this
 * provider stays NOT_CONFIGURED and routes matching jobs to browser
 * automation or manual application instead of pretending to submit.
 */
export class GreenhouseApplicationProvider extends BaseApplicationProvider {
  readonly key = "greenhouse";
  readonly name = "Greenhouse";

  protected isConfigured(): boolean {
    return false;
  }

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("Greenhouse Job Board Apply API is not provisioned for any employer yet.");
  }
}
