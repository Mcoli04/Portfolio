/**
 * Standalone application-processing worker (spec §16 queue architecture).
 * The swipe-right API route runs the automation engine synchronously for
 * immediate UI feedback, so this worker's job is crash recovery: any
 * application left stuck in "applying" (e.g. the server process died
 * mid-submission) gets picked back up and retried here instead of hanging
 * forever in an ambiguous state.
 *
 * .env.local is loaded by scripts/load-worker-env.cjs, preloaded via the
 * `worker:apply` npm script's `tsx --require` flag — not here. tsx hoists
 * this file's own imports above any top-level code in the file (matching
 * ESM import semantics), so an env-loading call placed here would run too
 * late: after src/lib/config.ts has already read process.env.
 */
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { ApplicationAutomationEngine } from "../lib/applications/engine";
import type { Job, Profile, ResumeVersion } from "../lib/types/database";

const POLL_INTERVAL_MS = 60 * 1000;
const STUCK_THRESHOLD_MS = 2 * 60 * 1000;

async function processStuckApplications() {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

  const { data: stuck, error } = await supabase
    .from("applications")
    .select("*")
    .eq("status", "applying")
    .lt("updated_at", cutoff)
    .limit(10);

  if (error) {
    console.error("[application-worker] failed to query stuck applications", error);
    return;
  }
  if (!stuck?.length) return;

  console.log(`[application-worker] recovering ${stuck.length} stuck application(s)`);
  const engine = new ApplicationAutomationEngine();

  for (const application of stuck) {
    try {
      const { data: job } = await supabase.from("jobs").select("*").eq("id", application.job_id).single<Job>();
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", application.user_id).single<Profile>();
      if (!job || !profile) continue;

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

      await engine.run({ supabase, application, job, profile, resumeVersion });
    } catch (err) {
      console.error(`[application-worker] failed to recover application ${application.id}`, err);
    }
  }
}

async function main() {
  console.log(`[application-worker] starting, poll interval=${POLL_INTERVAL_MS}ms`);
  await processStuckApplications();
  setInterval(processStuckApplications, POLL_INTERVAL_MS);
}

main();
