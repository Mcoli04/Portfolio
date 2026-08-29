import type { SupabaseClient } from "@supabase/supabase-js";
import { getAllJobSourceAdapters } from "@/lib/job-sources/registry";
import { computeDedupeHash, findDuplicate, type DuplicateCandidate } from "@/lib/dedupe";
import type { NormalizedJob } from "@/lib/job-sources/types";
import type { JobSourceRow } from "@/lib/types/database";

export interface IngestSummary {
  sourcesProcessed: number;
  jobsFetched: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsDeduplicated: number;
  errors: { source: string; message: string }[];
}

/**
 * Job ingestion worker (spec §41). Pulls from every configured adapter,
 * normalizes, deduplicates against existing rows, and upserts into `jobs`.
 * Adapters that are NOT_CONFIGURED simply return no jobs — this function
 * never substitutes fabricated data for a missing integration.
 */
export async function ingestJobs(supabase: SupabaseClient): Promise<IngestSummary> {
  const summary: IngestSummary = {
    sourcesProcessed: 0,
    jobsFetched: 0,
    jobsCreated: 0,
    jobsUpdated: 0,
    jobsDeduplicated: 0,
    errors: [],
  };

  const { data: sourceRows } = await supabase.from("job_sources").select("*").eq("enabled", true);
  const sourceRowByKey = new Map((sourceRows ?? []).map((row: JobSourceRow) => [row.key, row]));

  const adapters = getAllJobSourceAdapters();

  const { data: existingJobs } = await supabase
    .from("jobs")
    .select("id, title, company_name, locality, location, description, application_url, source, source_job_id")
    .eq("active", true);
  const candidates: DuplicateCandidate[] = existingJobs ?? [];

  for (const adapter of adapters) {
    summary.sourcesProcessed++;
    const sourceRow = sourceRowByKey.get(adapter.key);
    const status = adapter.getStatus();

    await supabase
      .from("job_sources")
      .update({ status, last_synced_at: new Date().toISOString() })
      .eq("key", adapter.key);

    if (status === "NOT_CONFIGURED" || status === "DISABLED") continue;

    try {
      const rawJobs = await adapter.fetchJobs();
      summary.jobsFetched += rawJobs.length;

      for (const raw of rawJobs) {
        const normalized = adapter.normalizeJob(raw);
        const duplicate = findDuplicate(normalized, adapter.key, candidates);

        if (duplicate) {
          summary.jobsDeduplicated++;
          await upsertJob(supabase, adapter.key, sourceRow?.id ?? null, normalized, duplicate.id);
          summary.jobsUpdated++;
          continue;
        }

        const { error, data } = await upsertJob(supabase, adapter.key, sourceRow?.id ?? null, normalized, null);
        if (!error && data) {
          candidates.push({
            id: data.id,
            title: normalized.title,
            company_name: normalized.companyName,
            locality: normalized.locality ?? null,
            location: normalized.location ?? null,
            description: normalized.description,
            application_url: normalized.applicationUrl ?? null,
            source: adapter.key,
            source_job_id: normalized.sourceJobId,
          });
          summary.jobsCreated++;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      summary.errors.push({ source: adapter.key, message });
      await supabase.from("job_sources").update({ last_error: message }).eq("key", adapter.key);
    }
  }

  return summary;
}

async function upsertJob(
  supabase: SupabaseClient,
  sourceKey: string,
  sourceId: string | null,
  normalized: NormalizedJob,
  mergeIntoJobId: string | null
) {
  const dedupeHash = computeDedupeHash(normalized);

  const row = {
    source: sourceKey,
    source_id: sourceId,
    source_job_id: normalized.sourceJobId,
    title: normalized.title,
    company_name: normalized.companyName,
    company_logo: normalized.companyLogo ?? null,
    description: normalized.description,
    responsibilities: normalized.responsibilities ?? null,
    requirements: normalized.requirements ?? null,
    skills: normalized.skills,
    salary_min: normalized.salaryMin ?? null,
    salary_max: normalized.salaryMax ?? null,
    salary_currency: normalized.salaryCurrency ?? "EUR",
    location: normalized.location ?? null,
    locality: normalized.locality ?? null,
    country: "Malta",
    remote_type: normalized.remoteType ?? null,
    employment_type: normalized.employmentType ?? null,
    experience_level: normalized.experienceLevel ?? null,
    industry: normalized.industry ?? null,
    posted_at: normalized.postedAt,
    expires_at: normalized.expiresAt ?? null,
    application_url: normalized.applicationUrl ?? null,
    application_email: normalized.applicationEmail ?? null,
    application_method: normalized.applicationMethod,
    application_provider: normalized.applicationProvider ?? null,
    auto_apply_supported: normalized.autoApplySupported,
    dedupe_hash: dedupeHash,
    canonical_job_id: mergeIntoJobId,
    status: mergeIntoJobId ? ("UPDATED" as const) : ("ACTIVE" as const),
    active: true,
    raw: normalized.raw,
  };

  return supabase
    .from("jobs")
    .upsert(row, { onConflict: "source,source_job_id" })
    .select("id")
    .single();
}

/** Marks jobs past their expiry date (or no longer found live at the source) inactive (spec §25, §42). */
export async function expireStaleJobs(supabase: SupabaseClient): Promise<{ expired: number }> {
  const { data, error } = await supabase
    .from("jobs")
    .update({ active: false, status: "EXPIRED" })
    .lt("expires_at", new Date().toISOString())
    .eq("active", true)
    .select("id");

  if (error) throw new Error(error.message);
  return { expired: data?.length ?? 0 };
}
