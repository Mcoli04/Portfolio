import type { Job, IntegrationStatus } from "@/lib/types/database";
import type { ApplicationForm, ApplicationProvider, CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Base provider: reports NOT_CONFIGURED and refuses to submit until a
 * subclass overrides isConfigured() to true. This means "flip a provider
 * on" is purely a matter of supplying real, tested credentials — never a
 * code change that silently starts claiming success.
 */
export abstract class BaseApplicationProvider implements ApplicationProvider {
  abstract readonly key: string;
  abstract readonly name: string;

  protected abstract isConfigured(): boolean;
  protected abstract submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult>;

  getStatus(): IntegrationStatus {
    return this.isConfigured() ? "LIVE" : "NOT_CONFIGURED";
  }

  async getApplicationForm(_job: Job): Promise<ApplicationForm | null> {
    return null;
  }

  validateCandidate(candidate: CandidateApplicationData): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!candidate.fullName) missing.push("fullName");
    if (!candidate.email) missing.push("email");
    if (!candidate.resumeText && !candidate.resumeFileBuffer) missing.push("resume");
    return { valid: missing.length === 0, missing };
  }

  async uploadResume(): Promise<{ uploaded: boolean; reference?: string }> {
    return { uploaded: false };
  }

  async uploadCoverLetter(): Promise<{ uploaded: boolean; reference?: string }> {
    return { uploaded: false };
  }

  async answerQuestions(): Promise<{ answers: Record<string, string>; manualRequired: boolean }> {
    return { answers: {}, manualRequired: false };
  }

  async submitApplication(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    if (!this.isConfigured()) {
      return { success: false, manualRequired: true, errorMessage: `${this.name} is not configured (NOT_CONFIGURED).` };
    }
    const { valid, missing } = this.validateCandidate(candidate);
    if (!valid) {
      return { success: false, manualRequired: true, errorMessage: `Missing required candidate data: ${missing.join(", ")}` };
    }
    try {
      return await this.submitLive(job, candidate);
    } catch (error) {
      return {
        success: false,
        manualRequired: false,
        errorMessage: error instanceof Error ? error.message : "Unknown submission error",
      };
    }
  }

  async verifySubmission(_externalApplicationId: string): Promise<boolean> {
    return false;
  }

  async getApplicationStatus(_externalApplicationId: string): Promise<string> {
    return "unknown";
  }
}
