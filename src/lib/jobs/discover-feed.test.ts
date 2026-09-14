import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDiscoverFeed } from "./discover-feed";
import type { Job, Profile } from "@/lib/types/database";

const USER_ID = "user-1";

function makeProfile(): Profile {
  return {
    id: USER_ID,
    email: "candidate@example.com",
    skills: [],
    job_titles: [],
  } as unknown as Profile;
}

function makeJob(overrides: Partial<Job>): Job {
  return {
    id: overrides.id ?? "job-x",
    title: "Test Role",
    company_name: "Test Employer",
    skills: [],
    locality: null,
    location: "Malta",
    active: true,
    canonical_job_id: null,
    expires_at: null,
    posted_at: new Date().toISOString(),
    ...overrides,
  } as unknown as Job;
}

/**
 * Fake Supabase client for getDiscoverFeed(). The "jobs" table's query is
 * awaited directly (no .single()/.maybeSingle() terminal call in the real
 * code), so the builder itself must be thenable — matching real
 * supabase-js query-builder semantics.
 */
function makeFakeSupabase(jobs: Job[]): SupabaseClient {
  const client = {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: makeProfile(), error: null }) }) }) };
      }
      if (table === "job_preferences") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }
      if (table === "job_interactions") {
        return { select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) };
      }
      if (table === "applications") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }
      if (table === "jobs") {
        const filters: { col: string; op: "eq" | "is"; val: unknown }[] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push({ col, op: "eq", val });
            return builder;
          },
          is(col: string, val: unknown) {
            filters.push({ col, op: "is", val });
            return builder;
          },
          or() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          then(onFulfilled: (v: { data: Job[]; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
            const filtered = jobs.filter((job) =>
              filters.every((f) => {
                const actual = (job as unknown as Record<string, unknown>)[f.col];
                if (f.op === "eq") return actual === f.val;
                if (f.op === "is") return actual === f.val; // null === null
                return true;
              })
            );
            return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
          },
        };
        return { select: () => builder };
      }
      throw new Error(`makeFakeSupabase: unexpected table "${table}"`);
    },
  };
  return client as unknown as SupabaseClient;
}

test("getDiscoverFeed: a job with a non-null canonical_job_id (a known duplicate) is excluded", async () => {
  const duplicate = makeJob({ id: "job-dup", canonical_job_id: "job-canonical", title: "Salesforce Marketing Cloud Developer" });
  const client = makeFakeSupabase([duplicate]);

  const { jobs } = await getDiscoverFeed(client, USER_ID);

  assert.equal(jobs.find((j) => j.id === "job-dup"), undefined, "a job merged into another must not appear in Discover");
});

test("getDiscoverFeed: the canonical job (canonical_job_id: null) remains visible", async () => {
  const canonical = makeJob({ id: "job-canonical", canonical_job_id: null, title: "Salesforce Marketing Cloud Developer" });
  const duplicate = makeJob({ id: "job-dup", canonical_job_id: "job-canonical", title: "Salesforce Marketing Cloud Developer" });
  const client = makeFakeSupabase([canonical, duplicate]);

  const { jobs } = await getDiscoverFeed(client, USER_ID);

  assert.ok(jobs.find((j) => j.id === "job-canonical"), "the canonical job must remain visible");
  assert.equal(jobs.find((j) => j.id === "job-dup"), undefined, "its duplicate must still be excluded");
  assert.equal(jobs.length, 1, "exactly one card for this pair, not two");
});

test("getDiscoverFeed: an ordinary job with no dedup history at all remains unaffected", async () => {
  const ordinary = makeJob({ id: "job-ordinary", canonical_job_id: null, title: "Junior Accountant" });
  const client = makeFakeSupabase([ordinary]);

  const { jobs } = await getDiscoverFeed(client, USER_ID);

  assert.ok(jobs.find((j) => j.id === "job-ordinary"), "an ordinary, never-deduplicated job must still appear");
});
