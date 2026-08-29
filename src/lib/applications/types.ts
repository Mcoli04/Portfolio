import type { Job, IntegrationStatus } from "@/lib/types/database";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "file" | "boolean";
  required: boolean;
  options?: string[];
}

export interface ApplicationForm {
  fields: FormField[];
  /** true if the platform detected something it must not bypass (CAPTCHA, MFA, login wall). */
  requiresHumanVerification: boolean;
}

export interface CandidateApplicationData {
  fullName: string;
  email: string;
  phone?: string;
  resumeText: string;
  resumeFilePath?: string;
  resumeFileBuffer?: Buffer;
  resumeFileName?: string;
  coverLetterText?: string;
  answers: Record<string, string>;
}

export interface SubmissionResult {
  success: boolean;
  externalApplicationId?: string;
  manualRequired?: boolean;
  errorMessage?: string;
  confirmationDetails?: Record<string, unknown>;
}

/**
 * Contract every submission channel implements (spec §17). A provider that
 * cannot verify its own submission (e.g. a form with no confirmation page)
 * must report manualRequired rather than success:true — "submitted" is
 * reserved for channels the platform actually confirmed.
 */
export interface ApplicationProvider {
  readonly key: string;
  readonly name: string;

  getStatus(): IntegrationStatus;
  getApplicationForm(job: Job): Promise<ApplicationForm | null>;
  validateCandidate(candidate: CandidateApplicationData): { valid: boolean; missing: string[] };
  uploadResume(job: Job, candidate: CandidateApplicationData): Promise<{ uploaded: boolean; reference?: string }>;
  uploadCoverLetter(job: Job, candidate: CandidateApplicationData): Promise<{ uploaded: boolean; reference?: string }>;
  answerQuestions(
    job: Job,
    form: ApplicationForm,
    candidate: CandidateApplicationData
  ): Promise<{ answers: Record<string, string>; manualRequired: boolean }>;
  submitApplication(job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult>;
  verifySubmission(externalApplicationId: string): Promise<boolean>;
  getApplicationStatus(externalApplicationId: string): Promise<string>;
}
