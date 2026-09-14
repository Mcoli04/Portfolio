import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Ashby's public job board API is read-only. Their Application API
 * requires an employer-issued API key with write scope, which no employer
 * has granted yet — stays NOT_CONFIGURED.
 */
export class AshbyApplicationProvider extends BaseApplicationProvider {
  readonly key = "ashby";
  readonly name = "Ashby";

  protected isConfigured(): boolean {
    return false;
  }

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("Ashby Application API is not provisioned for any employer yet.");
  }
}
