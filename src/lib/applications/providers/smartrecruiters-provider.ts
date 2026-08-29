import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * SmartRecruiters' public postings API is read-only. Submitting an
 * application requires their Apply API with an employer-issued OAuth
 * client, which no employer has granted yet — stays NOT_CONFIGURED.
 */
export class SmartRecruitersApplicationProvider extends BaseApplicationProvider {
  readonly key = "smartrecruiters";
  readonly name = "SmartRecruiters";

  protected isConfigured(): boolean {
    return false;
  }

  protected async submitLive(_job: Job, _candidate: CandidateApplicationData): Promise<SubmissionResult> {
    throw new Error("SmartRecruiters Apply API is not provisioned for any employer yet.");
  }
}
