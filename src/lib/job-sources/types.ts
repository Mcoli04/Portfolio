import type {
  ApplicationMethod,
  EmploymentType,
  ExperienceLevel,
  IntegrationStatus,
  WorkType,
} from "@/lib/types/database";

export type JobSourceKind =
  | "government"
  | "eu_network"
  | "employer_feed"
  | "licensed_api"
  | "ats"
  | "email"
  | "internal";

/** Raw payload as returned by the source, before normalization. Shape varies per adapter. */
export type RawSourceJob = Record<string, unknown>;

export interface NormalizedJob {
  sourceJobId: string;
  title: string;
  companyName: string;
  companyLogo?: string;
  companyWebsite?: string;
  description: string;
  responsibilities?: string;
  requirements?: string;
  skills: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  location?: string;
  locality?: string;
  remoteType?: WorkType;
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  industry?: string;
  postedAt: string;
  expiresAt?: string;
  applicationUrl?: string;
  applicationEmail?: string;
  applicationMethod: ApplicationMethod;
  applicationProvider?: string;
  autoApplySupported: boolean;
  raw: RawSourceJob;
}

export type JobLiveStatus = "active" | "expired" | "closed" | "unknown";

/**
 * Contract every job source must implement (spec §9). Adapters that lack
 * live credentials/config MUST report status NOT_CONFIGURED and return an
 * empty result set from fetchJobs() rather than inventing data — demo data
 * is only ever injected by the dedicated "demo" source, never by a real
 * adapter pretending to be live.
 */
export interface JobSourceAdapter {
  readonly key: string;
  readonly name: string;
  readonly kind: JobSourceKind;

  getStatus(): IntegrationStatus;

  /** Pull the current set of raw job postings from the source. */
  fetchJobs(): Promise<RawSourceJob[]>;

  /** Fetch a single job by the source's own id, if the source supports lookups. */
  getJob(sourceJobId: string): Promise<RawSourceJob | null>;

  /** Convert a raw payload into the platform's normalized job shape. */
  normalizeJob(raw: RawSourceJob): NormalizedJob;

  /** Where a human (or automation) should go to submit an application. */
  getApplicationUrl(raw: RawSourceJob): string | null;

  /** How the platform can submit on the candidate's behalf for this job. */
  getApplicationMethod(raw: RawSourceJob): ApplicationMethod;

  getCompany(raw: RawSourceJob): { name: string; logo?: string; website?: string };

  /** Re-check whether a previously ingested job is still live at the source. */
  checkJobStatus(sourceJobId: string): Promise<JobLiveStatus>;
}
