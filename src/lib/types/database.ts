// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Kept in sync manually; if the schema changes, update this file alongside
// the migration. (A generated-types workflow can replace this once a real
// Supabase project is linked — see README.)

export type IntegrationStatus = "LIVE" | "DEMO" | "NOT_CONFIGURED" | "DISABLED";

export type OnboardingStep =
  | "create_account"
  | "upload_cv"
  | "parse_cv"
  | "review_cv"
  | "goals"
  | "preferences"
  | "salary"
  | "auto_apply_mode"
  | "consent"
  | "complete";

export type AutoApplyMode = "auto" | "hybrid" | "review";

export type WorkType = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "temporary" | "internship";
export type ExperienceLevel = "internship" | "entry" | "junior" | "mid" | "senior" | "lead" | "executive";

export type WorkSituation = "employed" | "self_employed" | "unemployed" | "student";
export type MoveTimeline = "asap" | "within_1_3_months" | "within_3_6_months" | "exploring";
export type CareerGoal =
  | "better_salary"
  | "career_progression"
  | "better_work_life_balance"
  | "more_flexibility"
  | "role_in_field"
  | "career_change"
  | "first_job";
export type RemoteScope = "malta_only" | "eu_eea" | "europe" | "worldwide";

/**
 * Explicit, user-provided only — never inferred from CV text, nationality
 * guesses, or location. "prefer_not_to_say" is a real, distinct answer
 * (the user engaged with the question but chose not to share) and is
 * deliberately never used to auto-answer a real application's work
 * authorization question — see src/lib/applications/work-authorization.ts.
 */
export type WorkAuthorization = "eu_eea_swiss_citizen" | "malta_permit_holder" | "requires_sponsorship" | "prefer_not_to_say";

export type ApplicationMethod = "api" | "ats" | "browser_automation" | "email" | "internal" | "manual";

export type ApplicationStatus =
  | "interested"
  | "queued"
  | "applying"
  | "submitted"
  | "failed"
  | "manual_required"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export type JobInteractionAction = "viewed" | "saved" | "rejected" | "dismissed" | "undone";

export type JobStatus = "NEW" | "ACTIVE" | "UPDATED" | "EXPIRED" | "CLOSED" | "ARCHIVED";

export interface EducationEntry {
  institution: string;
  degree: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  year?: number;
}

export interface ParsedCvData {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  skills: string[];
  jobTitles: string[];
  employers: string[];
  yearsExperience?: number;
  education: EducationEntry[];
  certifications: CertificationEntry[];
  languages: string[];
  industries: string[];
  /** true when parsing used AI; false means the deterministic heuristic fallback ran */
  aiAssisted: boolean;
  warnings: string[];
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  /**
   * Split name fields for a future official application-submission
   * integration (e.g. Greenhouse's Apply API requires first/last name
   * separately). full_name remains the source of truth for every existing
   * display/salutation use — these are additive, kept in sync with it
   * whenever the user sets them via onboarding or Profile settings, never
   * derived on the fly from full_name at submission time.
   */
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  years_experience: number | null;
  skills: string[];
  job_titles: string[];
  employers: string[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  languages: string[];
  industries: string[];
  default_resume_id: string | null;
  role: "user" | "employer" | "admin";
  onboarding_step: OnboardingStep;
  onboarding_completed: boolean;
  auto_apply_mode: AutoApplyMode;
  auto_apply_authorized: boolean;
  auto_apply_authorized_at: string | null;
  work_situation: WorkSituation | null;
  move_timeline: MoveTimeline | null;
  career_goals: CareerGoal[];
  work_authorization: WorkAuthorization | null;
  created_at: string;
  updated_at: string;
}

export interface Resume {
  id: string;
  user_id: string;
  label: string;
  is_default: boolean;
  latest_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResumeVersion {
  id: string;
  resume_id: string;
  user_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  parse_status: "pending" | "parsed" | "failed";
  parsed_data: ParsedCvData | null;
  parse_error: string | null;
  created_at: string;
}

export interface JobPreferences {
  id: string;
  user_id: string;
  job_titles: string[];
  custom_titles: string[];
  locations: string[];
  work_types: string[];
  remote_scope: RemoteScope | null;
  employment_types: EmploymentType[];
  experience_levels: ExperienceLevel[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  industries: string[];
  keywords_include: string[];
  keywords_exclude: string[];
  visa_sponsorship_required: boolean;
  languages: string[];
  recently_posted_only: boolean;
  salary_disclosed_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  website: string | null;
  industry: string | null;
  description: string | null;
  location: string | null;
  verified: boolean;
  application_methods: unknown[];
  created_at: string;
  updated_at: string;
}

export interface JobSourceRow {
  id: string;
  key: string;
  name: string;
  kind: "government" | "eu_network" | "employer_feed" | "licensed_api" | "ats" | "email" | "internal";
  status: IntegrationStatus;
  enabled: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  source_id: string | null;
  source: string;
  source_job_id: string;
  title: string;
  company_id: string | null;
  company_name: string;
  company_logo: string | null;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  skills: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  location: string | null;
  locality: string | null;
  country: string;
  remote_type: WorkType | null;
  employment_type: EmploymentType | null;
  experience_level: ExperienceLevel | null;
  industry: string | null;
  posted_at: string;
  expires_at: string | null;
  application_url: string | null;
  application_email: string | null;
  application_method: ApplicationMethod;
  application_provider: string | null;
  auto_apply_supported: boolean;
  dedupe_hash: string | null;
  canonical_job_id: string | null;
  status: JobStatus;
  active: boolean;
  raw: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface JobWithMatch extends Job {
  match_score: number;
  match_reasons: string[];
}

export interface JobInteraction {
  id: string;
  user_id: string;
  job_id: string;
  action: JobInteractionAction;
  match_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  job_id: string;
  company_id: string | null;
  resume_id: string | null;
  submitted_resume_id: string | null;
  cover_letter_id: string | null;
  match_score: number | null;
  application_method: ApplicationMethod;
  application_provider: string | null;
  status: ApplicationStatus;
  manual_required: boolean;
  external_application_id: string | null;
  submitted_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEvent {
  id: string;
  application_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * A required employer question the engine could not safely resolve,
 * persisted with the full field shape (type, declared select options) so
 * a future UI can render a correct answer input — never just the
 * question text. answer_value/answer_source/source_answer_library_id
 * stay null until a future answering phase exists; Phase 1 never writes
 * them.
 */
export interface ApplicationPendingQuestion {
  id: string;
  application_id: string;
  field_id: string;
  question_text: string;
  field_type: "text" | "textarea" | "select" | "file" | "boolean";
  options: { label: string; value: string }[] | null;
  required: boolean;
  answer_value: string | null;
  answer_source: "application_only" | "answer_library" | null;
  source_answer_library_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnswerLibraryEntry {
  id: string;
  user_id: string;
  question_key: string;
  question_text: string;
  answer_text: string;
  answer_type: "text" | "boolean" | "number" | "select";
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}
