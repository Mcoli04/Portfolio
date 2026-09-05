import type { Job, IntegrationStatus } from "@/lib/types/database";

/**
 * What a field actually represents, independent of its input `type`.
 * "screening_question" (the default when `role` is omitted, preserving
 * every existing provider's behavior) routes through answerQuestion() and
 * the verified Answer Library. Every other role is structured candidate
 * data — resolved directly from the profile or the already-prepared
 * documents, and never via answerQuestion() or the Answer Library.
 */
export type FormFieldRole =
  | "full_name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "resume"
  | "cover_letter"
  | "screening_question";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "file" | "boolean";
  required: boolean;
  /** Defaults to "screening_question" when omitted. */
  role?: FormFieldRole;
  /** For type "select": the exact literal values this provider's form accepts. */
  options?: string[];
  /**
   * For type "boolean" only: the exact literal values THIS provider's
   * form/API expects for true/false (e.g. "Yes"/"No", "true"/"false", a
   * specific option id). A boolean field with either value undeclared can
   * never be auto-answered — there is no universal "Yes"/"No" to fall
   * back to, and inventing one would mean guessing at a specific
   * employer's contract instead of using what they actually declared.
   */
  trueValue?: string;
  falseValue?: string;
}

export interface ApplicationForm {
  fields: FormField[];
  /** true if the platform detected something it must not bypass (CAPTCHA, MFA, login wall). */
  requiresHumanVerification: boolean;
}

export interface CandidateApplicationData {
  fullName: string;
  firstName?: string;
  lastName?: string;
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
