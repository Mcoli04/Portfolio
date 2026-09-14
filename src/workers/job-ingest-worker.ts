/**
 * Standalone job-ingestion worker (spec §41). Run as a long-lived process
 * (`npm run worker:ingest`) in environments that support one — e.g. a small
 * container or VM alongside the Next.js app — as an alternative to hitting
 * /api/cron/ingest-jobs from an external scheduler. Both paths call the
 * same ingestJobs()/expireStaleJobs() functions, so behaviour is identical.
 *
 * .env.local is loaded by scripts/load-worker-env.cjs, preloaded via the
 * `worker:ingest` npm script's `tsx --require` flag — not here. tsx hoists
 * this file's own imports above any top-level code in the file (matching
 * ESM import semantics), so an env-loading call placed here would run too
 * late: after src/lib/config.ts has already read process.env.
 */
import { createServiceRoleClient } from "../lib/supabase/service-role";
import { ingestJobs, expireStaleJobs } from "../lib/jobs/ingest";

const INTERVAL_MS = 20 * 60 * 1000;

async function tick() {
  const startedAt = new Date().toISOString();
  try {
    const supabase = createServiceRoleClient();
    const [ingestSummary, expirySummary] = await Promise.all([ingestJobs(supabase), expireStaleJobs(supabase)]);
    console.log(`[job-ingest-worker] ${startedAt}`, JSON.stringify({ ingestSummary, expirySummary }));
  } catch (error) {
    console.error(`[job-ingest-worker] ${startedAt} failed`, error);
  }
}

async function main() {
  console.log(`[job-ingest-worker] starting, interval=${INTERVAL_MS}ms`);
  await tick();
  setInterval(tick, INTERVAL_MS);
}

main();
