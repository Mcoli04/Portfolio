import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestJobs } from "./ingest";
import { DEMO_JOBS } from "@/lib/demo/jobs";

/**
 * A source-job upsert can fail (e.g. a row that would violate a database
 * CHECK constraint) without Supabase throwing — it comes back as
 * `{ data: null, error }`. Before this test's corresponding fix, ingestJobs()
 * silently ignored that `error` at both call sites (new job, and merge into
 * an existing duplicate), so a bad row vanished from a run with no log line,
 * no summary.errors entry, and no counter movement. These tests drive the
 * real ingestJobs() against the bundled demo dataset — the only adapter
 * that's ever "configured" with no env vars set, matching the assumption
 * engine.test.ts already relies on (no .env.local is loaded under `tsx
 * --test`) — with a fake Supabase client that fails the upsert for one
 * specific job on each path, and asserts the failure surfaces instead of
 * disappearing.
 */

const FAILING_CREATE_JOB_ID = "demo-001";
// title "Marketing Executive" @ "Blue Lagoon Hospitality Group" / "St Julian's"
// — seeded below as an already-existing job so this one takes the
// merge-into-duplicate path instead of the create path.
const FAILING_MERGE_JOB_ID = "demo-002";
const EXISTING_DUPLICATE_ROW = {
  id: "existing-dup-1",
  title: "Marketing Executive",
  company_name: "Blue Lagoon Hospitality Group",
  locality: "St Julian's",
  location: null,
  description: "",
  application_url: null,
  source: "other_source",
  source_job_id: "existing-dup-1",
};
const FAKE_DB_ERROR_MESSAGE = 'new row for relation "jobs" violates check constraint "jobs_application_method_check"';

interface EqBuilder {
  eq(): EqBuilder;
  then(onFulfilled: (value: { data: unknown; error: unknown }) => unknown): unknown;
}

function makeAwaitableEq(result: { data: unknown; error: unknown }) {
  const builder: EqBuilder = {
    eq() {
      return builder;
    },
    then(onFulfilled) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
  return builder;
}

function createFakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      if (table === "job_sources") {
        return {
          select() {
            return makeAwaitableEq({ data: [], error: null });
          },
          update() {
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }

      if (table === "jobs") {
        return {
          select() {
            // The pre-loop existing-active-jobs query (dedupe candidates)
            // filters with a single .eq("active", true); reconcileClosedJobs
            // chains a second .eq("source", ...) on top of it. Branching on
            // how many .eq() calls were chained lets one fake serve both
            // real call sites: the seeded duplicate candidate for dedup, and
            // an empty result for reconciliation (out of scope for this
            // test — no stale jobs to deactivate).
            let eqCount = 0;
            const builder: EqBuilder = {
              eq() {
                eqCount++;
                return builder;
              },
              then(onFulfilled) {
                const result = eqCount <= 1 ? { data: [EXISTING_DUPLICATE_ROW], error: null } : { data: [], error: null };
                return Promise.resolve(result).then(onFulfilled);
              },
            };
            return builder;
          },
          upsert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    // The merge path (canonical_job_id set) and the create
                    // path (canonical_job_id null) both funnel through this
                    // same upsertJob() call — matching on source_job_id
                    // covers both of this test's failure cases regardless
                    // of which path triggered them.
                    if (row.source_job_id === FAILING_CREATE_JOB_ID || row.source_job_id === FAILING_MERGE_JOB_ID) {
                      return Promise.resolve({ data: null, error: { message: FAKE_DB_ERROR_MESSAGE } });
                    }
                    return Promise.resolve({ data: { id: `job-${row.source_job_id}` }, error: null });
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`createFakeSupabase: unexpected table "${table}"`);
    },
  } as unknown as SupabaseClient;
}

test("ingestJobs: a failed create-path upsert is reported, not silently dropped", async () => {
  const supabase = createFakeSupabase();
  const summary = await ingestJobs(supabase);

  assert.equal(summary.jobsFetched, DEMO_JOBS.length);

  const createFailure = summary.errors.find((e) => e.message.includes(FAILING_CREATE_JOB_ID));
  assert.ok(createFailure, "expected summary.errors to report the failed create-path upsert");
  assert.equal(createFailure?.source, "demo");
  assert.ok(createFailure?.message.includes(FAKE_DB_ERROR_MESSAGE));
});

test("ingestJobs: a failed merge-path upsert is reported, not counted as a successful update", async () => {
  const supabase = createFakeSupabase();
  const summary = await ingestJobs(supabase);

  assert.equal(summary.jobsDeduplicated, 1, "demo-002 should have matched the seeded existing duplicate");

  const mergeFailure = summary.errors.find((e) => e.message.includes(FAILING_MERGE_JOB_ID));
  assert.ok(mergeFailure, "expected summary.errors to report the failed merge-path upsert");
  assert.equal(mergeFailure?.source, "demo");
  assert.ok(mergeFailure?.message.includes(FAKE_DB_ERROR_MESSAGE));
  assert.equal(summary.jobsUpdated, 0, "the failed merge must not be counted as a successful update");
});

test("ingestJobs: unrelated jobs in the same run still succeed despite another job's upsert failing", async () => {
  const supabase = createFakeSupabase();
  const summary = await ingestJobs(supabase);

  // Every demo job goes in except two rigged failures: 1 (demo-002) matches
  // the seeded duplicate and is rigged to fail its merge; 1 (demo-001) is
  // rigged to fail its create. Everything else should still create
  // normally, and neither failing id should be double-counted as both a
  // failure and a success.
  assert.equal(summary.jobsCreated, DEMO_JOBS.length - 2);
  assert.equal(summary.errors.length, 2);
});
