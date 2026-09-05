import type { Job } from "@/lib/types/database";
import { env, isResendConfigured } from "@/lib/config";
import { BaseApplicationProvider } from "./base";
import type { CandidateApplicationData, SubmissionResult } from "../types";

/**
 * Authorised email application (spec §36): only used when the job itself
 * carries an application_email the employer published — never sends an
 * unsolicited CV to an address the platform guessed. Real send via Resend
 * when RESEND_API_KEY is configured; otherwise NOT_CONFIGURED.
 */
export class EmailApplicationProvider extends BaseApplicationProvider {
  readonly key = "email";
  readonly name = "Authorised email application";

  protected isConfigured(): boolean {
    return isResendConfigured;
  }

  protected async submitLive(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    if (!job.application_email) {
      return { success: false, manualRequired: true, errorMessage: "Job has no published application email." };
    }

    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);

    const subject = `Application for ${job.title} – ${candidate.fullName}`;
    const body = candidate.coverLetterText
      ? candidate.coverLetterText
      : `Dear ${job.company_name} hiring team,\n\nPlease find attached my CV for the ${job.title} position.\n\nKind regards,\n${candidate.fullName}`;

    const attachments = candidate.resumeFileBuffer
      ? [{ filename: candidate.resumeFileName ?? "cv.pdf", content: candidate.resumeFileBuffer }]
      : [];

    const result = await resend.emails.send({
      from: "applications@maltajobs.app",
      to: job.application_email,
      replyTo: candidate.email,
      subject,
      text: body,
      attachments,
    });

    if (result.error) {
      return { success: false, errorMessage: result.error.message };
    }

    return {
      success: true,
      externalApplicationId: result.data?.id,
      confirmationDetails: { recipient: job.application_email, messageId: result.data?.id },
    };
  }

  async verifySubmission(externalApplicationId: string): Promise<boolean> {
    return Boolean(externalApplicationId);
  }

  async getApplicationStatus(): Promise<string> {
    return "sent";
  }
}
