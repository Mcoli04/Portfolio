import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Lever's public postings API is read-only for job discovery. Submitting
 * an application on a candidate's behalf requires Lever's Postings Apply
 * API, granted per-account by Lever after partner review. No such grant
 * exists yet for any employer, so this stays NOT_CONFIGURED.
 */
export class LeverApplicationProvider extends BaseApplicationProvider {
  readonly key = "lever";
  readonly name = "Lever";

  protected isConfigured(): boolean {
    return false;
  }

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("Lever Postings Apply API is not provisioned for any employer yet.");
  }
}
