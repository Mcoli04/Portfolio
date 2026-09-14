import type { Job } from "@/lib/types/database";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Direct employer integration submission (spec §17, §38): posts the
 * candidate's application to an endpoint an employer explicitly provided
 * when they authorised direct applications through this platform
 * (job.raw.submissionEndpoint, set by CustomEmployerAdapter/EmployerFeedAdapter).
 * NOT_CONFIGURED for any job that doesn't carry such an endpoint.
 */
export class EmployerIntegrationApplicationProvider extends BaseApplicationProvider {
  readonly key = "employer_integration";
  readonly name = "Direct employer integration";

  protected isConfigured(): boolean {
    // No employer has authorised a direct submission endpoint yet (would be
    // set via job_sources.config by an admin after an employer partnership).
    // Real per-job endpoints, once they exist, are still honoured by
    // submitLive below — this flag only governs the platform-wide status
    // shown in the admin dashboard.
    return false;
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    const endpoint = (job.raw as { submissionEndpoint?: string } | null)?.submissionEndpoint;
    if (!endpoint) {
      return {
        success: false,
        manualRequired: true,
        errorMessage: "This employer has not configured a direct submission endpoint.",
      };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobSourceId: job.source_job_id,
        candidate: {
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          coverLetter: candidate.coverLetterText,
          answers: candidate.answers,
        },
      }),
    });

    if (!res.ok) {
      return { success: false, errorMessage: `Employer endpoint responded ${res.status}` };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: true,
      externalApplicationId: typeof data.applicationId === "string" ? data.applicationId : undefined,
      confirmationDetails: data,
    };
  }
}
