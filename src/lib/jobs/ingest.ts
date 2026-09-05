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
  jobsDeactivated: number;
  errors: { source: string; message: string }[];
}

/**
 * Job ingestion worker (spec §41). Pulls from every configured adapter,
 * normalizes, deduplicates against existing rows, upserts into `jobs`, and
 * — only after that source's fetch genuinely succeeded — reconciles closed
 * jobs (see reconcileClosedJobs). Adapters that are NOT_CONFIGURED simply
 * return no jobs — this function never substitutes fabricated data for a
 * missing integration.
 */
export async function ingestJobs(supabase: SupabaseClient): Promise<IngestSummary> {
  const summary: IngestSummary = {
    sourcesProcessed: 0,
    jobsFetched: 0,
    jobsCreated: 0,
    jobsUpdated: 0,
    jobsDeduplicated: 0,
    jobsDeactivated: 0,
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

    let fetched = 0;
    let created = 0;
    let updated = 0;
    let deduplicated = 0;
    let deactivated = 0;

    try {
      const rawJobs = await adapter.fetchJobs();
      fetched = rawJobs.length;
      summary.jobsFetched += fetched;

      const seenSourceJobIds = new Set<string>();

      for (const raw of rawJobs) {
        const normalized = adapter.normalizeJob(raw);
        seenSourceJobIds.add(normalized.sourceJobId);
        const duplicate = findDuplicate(normalized, adapter.key, candidates);

        if (duplicate) {
          summary.jobsDeduplicated++;
          deduplicated++;
          await upsertJob(supabase, adapter.key, sourceRow?.id ?? null, normalized, duplicate.id);
          summary.jobsUpdated++;
          updated++;
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
          created++;
        } else if (!error) {
          updated++;
        }
      }

      // Reconciliation only runs once adapter.fetchJobs() above has
      // resolved without throwing — a genuinely successful fetch for this
      // source this run. A network/API failure throws (see
      // BaseJobSourceAdapter.fetchJobs) and is caught below, skipping this
      // entirely, so a transient outage can never be mistaken for "this
      // source now has zero jobs" and wrongly deactivate everything.
      deactivated = await reconcileClosedJobs(supabase, adapter.key, seenSourceJobIds);
      summary.jobsDeactivated += deactivated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      summary.errors.push({ source: adapter.key, message });
      await supabase.from("job_sources").update({ last_error: message }).eq("key", adapter.key);
    }

    console.log(
      `[job-ingest] source=${adapter.key} status=${status} fetched=${fetched} created=${created} updated=${updated} deduplicated=${deduplicated} deactivated=${deactivated}`
    );
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

/**
 * Deactivates previously-active jobs for one source whose source_job_id
 * wasn't present in that source's latest successful fetch — i.e. the
 * listing closed or was removed upstream. Only ever called after a
 * successful fetch (see call site above). Never deletes the row: a job's
 * `applications`/`application_events` history stays fully intact, and the
 * Applications page still renders it (jobs are only ever soft-deactivated,
 * never removed), it just stops appearing in Discover once `active` is
 * false. Uses "CLOSED" rather than expireStaleJobs()'s date-based
 * "EXPIRED" status, since this reflects a source-confirmed removal rather
 * than a reached expiry date.
 */
async function reconcileClosedJobs(
  supabase: SupabaseClient,
  sourceKey: string,
  seenSourceJobIds: Set<string>
): Promise<number> {
  const { data: activeRows, error } = await supabase
    .from("jobs")
    .select("id, source_job_id")
    .eq("source", sourceKey)
    .eq("active", true);

  if (error || !activeRows) return 0;

  const staleIds = activeRows
    .filter((row: { source_job_id: string }) => !seenSourceJobIds.has(row.source_job_id))
    .map((row: { id: string }) => row.id);

  if (staleIds.length === 0) return 0;

  const { data: deactivatedRows, error: updateError } = await supabase
    .from("jobs")
    .update({ active: false, status: "CLOSED" })
    .in("id", staleIds)
    .select("id");

  if (updateError) {
    console.error(`[job-ingest] source=${sourceKey} reconciliation update failed`, updateError.message);
    return 0;
  }
  return deactivatedRows?.length ?? 0;
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
