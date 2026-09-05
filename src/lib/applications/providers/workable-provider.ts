import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Workable's public widget API only lists jobs. Submitting applications
 * requires the account owner to grant a Workable API token with write
 * scope, which is a per-employer partnership step that hasn't happened for
 * any employer yet — so this stays NOT_CONFIGURED.
 */
export class WorkableApplicationProvider extends BaseApplicationProvider {
  readonly key = "workable";
  readonly name = "Workable";

  protected isConfigured(): boolean {
    return false;
  }

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("Workable write API token is not provisioned for any employer yet.");
  }
}
