import { BaseJobSourceAdapter } from "../base";
import type { NormalizedJob, RawSourceJob } from "../types";

export interface CustomEmployerConfig {
  /** Employers integrated one-off (their own careers-page JSON export, a signed webhook payload, etc). */
  integrations: { employerName: string; endpoint: string; applicationMethod: "internal" | "email" | "manual"; applicationEmail?: string }[];
}

const CUSTOM_EMPLOYER_APPLICATION_METHODS = ["internal", "email", "manual"] as const;
type CustomEmployerApplicationMethod = (typeof CUSTOM_EMPLOYER_APPLICATION_METHODS)[number];

function isCustomEmployerApplicationMethod(value: unknown): value is CustomEmployerApplicationMethod {
  return (
    typeof value === "string" &&
    (CUSTOM_EMPLOYER_APPLICATION_METHODS as readonly string[]).includes(value)
  );
}

function resolveApplicationEmail(raw: RawSourceJob): string | undefined {
  return typeof raw.__applicationEmail === "string" && raw.__applicationEmail.trim().length > 0
    ? raw.__applicationEmail.trim()
    : undefined;
}

/**
 * `__applicationMethod` is always set by fetchJobsLive() from the admin-
 * configured integration, never from the external employer feed's own
 * payload (the object spread there is overridden by this explicit field) —
 * but a config value outside CustomEmployerConfig's declared union (e.g. a
 * typo made directly against job_sources.config) must still fail safely
 * rather than being trusted through a cast and reaching the database's
 * application_method CHECK constraint unchecked. Any unrecognized value
 * falls back to "manual", identical to an omitted one.
 */
function resolveApplicationMethod(raw: RawSourceJob, applicationEmail: string | undefined): CustomEmployerApplicationMethod {
  const requestedMethod = isCustomEmployerApplicationMethod(raw.__applicationMethod) ? raw.__applicationMethod : "manual";
  return requestedMethod === "email" && !applicationEmail ? "manual" : requestedMethod;
}

/**
 * Catch-all for direct, bespoke employer integrations that don't fit a
 * standard ATS shape (e.g. a Malta employer's own careers API). Each entry
 * is added explicitly by an admin after the employer has authorised it —
 * never scraped or guessed.
 */
export class CustomEmployerAdapter extends BaseJobSourceAdapter {
  readonly key = "custom_employer";
  readonly name = "Direct employer integrations";
  readonly kind = "employer_feed" as const;

  constructor(private readonly config: CustomEmployerConfig | null) {
    super();
  }

  protected isConfigured(): boolean {
    return Boolean(this.config?.integrations?.length);
  }

  protected async fetchJobsLive(): Promise<RawSourceJob[]> {
    const results: RawSourceJob[] = [];
    for (const integration of this.config?.integrations ?? []) {
      try {
        const res = await fetch(integration.endpoint, { next: { revalidate: 0 } });
        if (!res.ok) continue;
        const data = await res.json();
        const jobs = Array.isArray(data?.jobs) ? data.jobs : Array.isArray(data) ? data : [];
        for (const job of jobs) {
          results.push({ ...job, __employerName: integration.employerName, __applicationMethod: integration.applicationMethod, __applicationEmail: integration.applicationEmail });
        }
      } catch (error) {
        console.error(`[custom_employer] failed to fetch ${integration.employerName}`, error);
      }
    }
    return results;
  }

  normalizeJob(raw: RawSourceJob): NormalizedJob {
    const applicationEmail = resolveApplicationEmail(raw);
    const method = resolveApplicationMethod(raw, applicationEmail);
    return {
      sourceJobId: String(raw.id ?? raw.jobId),
      title: String(raw.title ?? "Untitled role"),
      companyName: String(raw.__employerName ?? "Unknown employer"),
      description: String(raw.description ?? ""),
      skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : [],
      location: typeof raw.location === "string" ? raw.location : "Malta",
      postedAt: String(raw.postedAt ?? new Date().toISOString()),
      applicationUrl: typeof raw.applicationUrl === "string" ? raw.applicationUrl : undefined,
      applicationEmail,
      applicationMethod: method,
      applicationProvider: "internal",
      autoApplySupported: method !== "manual",
      raw,
    };
  }

  getApplicationUrl(raw: RawSourceJob): string | null {
    return typeof raw.applicationUrl === "string" ? raw.applicationUrl : null;
  }

  getApplicationMethod(raw: RawSourceJob) {
    return resolveApplicationMethod(raw, resolveApplicationEmail(raw));
  }

  getCompany(raw: RawSourceJob) {
    return { name: String(raw.__employerName ?? "Unknown employer") };
  }
}
