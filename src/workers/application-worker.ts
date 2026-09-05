/**
 * Standalone application-processing worker (spec §16 queue architecture).
 *
 * Has two jobs, run every poll tick:
 *
 * 1. Advance "queued" applications. The swipe-right route
 *    (src/app/api/applications/apply/route.ts) only ever runs the
 *    automation engine synchronously for "auto_submit" and
 *    "confirm_then_submit" actions — under Review Auto Apply mode (or a
 *    low-match Hybrid swipe), it inserts the application with
 *    status="queued" and returns immediately, deliberately never calling
 *    the engine itself. This worker is what actually processes that queue;
 *    without it, a queued application would sit there forever. Root cause
 *    of a real bug this file previously had: its query only ever selected
 *    status="applying", so "queued" rows were silently never selected at
 *    all — not a filter typo or casing mismatch ("queued" matches the
 *    applications_status_check constraint and the ApplicationStatus type
 *    exactly), just a missing query.
 * 2. Recover "applying" rows stuck past STUCK_THRESHOLD_MS — crash
 *    recovery for a server process that died mid-submission.
 *
 * .env.local is loaded by scripts/load-worker-env.cjs, preloaded via the
 * `worker:apply` npm script's `tsx --require` flag — not here. tsx hoists
 * this file's own imports above any top-level code in the file (matching
 * ESM import semantics), so an env-loading call placed here would run too
 * late: after src/lib/config.ts has already read process.env.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { ApplicationAutomationEngine } from "../lib/applications/engine";
import type { Application, Job, Profile, ResumeVersion } from "../lib/types/database";

const POLL_INTERVAL_MS = 60 * 1000;
const STUCK_THRESHOLD_MS = 2 * 60 * 1000;
const BATCH_LIMIT = 10;

/**
 * Looks up the job/profile/resume an application needs and runs it through
 * the automation engine, which decides submitted/manual_required/failed on
 * its own (demo jobs → simulated sandbox submission; unsupported or
 * unconfigured real providers → manual_required; a real failure →
 * failed). This worker never sets "submitted" itself — only the engine
 * does, and only once a provider actually confirms success — and only logs
 * non-sensitive identifiers (application/job ids, statuses), never profile,
 * resume, or cover-letter content.
 */
async function processApplication(supabase: SupabaseClient, engine: ApplicationAutomationEngine, application: Application, reason: "queued" | "stuck_applying") {
  console.log(`[application-worker] processing application ${application.id} (job ${application.job_id}, reason=${reason})`);

  try {
    const { data: job, error: jobError } = await supabase.from("jobs").select("*").eq("id", application.job_id).single<Job>();
    if (jobError || !job) {
      console.warn(`[application-worker] skipping application ${application.id}: job ${application.job_id} not found`);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", application.user_id)
      .single<Profile>();
    if (profileError || !profile) {
      console.warn(`[application-worker] skipping application ${application.id}: profile not found`);
      return;
    }

    let resumeVersion: ResumeVersion | null = null;
    if (profile.default_resume_id) {
      const { data: resume } = await supabase
        .from("resumes")
        .select("latest_version_id")
        .eq("id", profile.default_resume_id)
        .single();
      if (resume?.latest_version_id) {
        const { data: version } = await supabase
          .from("resume_versions")
          .select("*")
          .eq("id", resume.latest_version_id)
          .single<ResumeVersion>();
        resumeVersion = version ?? null;
      }
    }
    if (!resumeVersion) {
      console.log(`[application-worker] application ${application.id}: no resume on file — engine will route to manual_required`);
    }

    const outcome = await engine.run({ supabase, application, job, profile, resumeVersion });
    console.log(`[application-worker] application ${application.id} finished with status=${outcome.status}`);
  } catch (err) {
    console.error(`[application-worker] failed to process application ${application.id}`, err instanceof Error ? err.message : err);
  }
}

async function processQueuedApplications(supabase: SupabaseClient, engine: ApplicationAutomationEngine) {
  const { data: queued, error } = await supabase
    .from("applications")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT)
    .returns<Application[]>();

  if (error) {
    console.error("[application-worker] failed to query queued applications", error.message);
    return;
  }

  console.log(`[application-worker] queued applications found: ${queued?.length ?? 0}`);
  if (!queued?.length) return;

  for (const application of queued) {
    await processApplication(supabase, engine, application, "queued");
  }
}

async function processStuckApplyingApplications(supabase: SupabaseClient, engine: ApplicationAutomationEngine) {
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data: stuck, error } = await supabase
    .from("applications")
    .select("*")
    .eq("status", "applying")
    .lt("updated_at", cutoff)
    .limit(BATCH_LIMIT)
    .returns<Application[]>();

  if (error) {
    console.error("[application-worker] failed to query stuck applications", error.message);
    return;
  }

  console.log(`[application-worker] stuck 'applying' applications found: ${stuck?.length ?? 0}`);
  if (!stuck?.length) return;

  for (const application of stuck) {
    await processApplication(supabase, engine, application, "stuck_applying");
  }
}

async function pollTick() {
  const startedAt = new Date().toISOString();
  console.log(`[application-worker] poll tick started ${startedAt}`);
  const supabase = createServiceRoleClient();
  const engine = new ApplicationAutomationEngine();

  await processQueuedApplications(supabase, engine);
  await processStuckApplyingApplications(supabase, engine);
}

async function main() {
  console.log(`[application-worker] starting, poll interval=${POLL_INTERVAL_MS}ms`);
  await pollTick();
  setInterval(pollTick, POLL_INTERVAL_MS);
}

main();
