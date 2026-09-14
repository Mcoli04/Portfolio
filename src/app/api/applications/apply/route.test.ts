import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleApplyRequest } from "./route";

/**
 * Drives the REAL handleApplyRequest() end to end against a small, stateful
 * fake Supabase client — not a reimplementation of its logic. POST() itself
 * is an untested thin wrapper (resolves the real client/user, then
 * delegates here) matching every other route in this codebase; the actual
 * duplicate/claim/race logic lives in handleApplyRequest(), which is fully
 * exercised here. Test profiles use default_resume_id: null, so any
 * request that reaches engine.run() hits its early, dependency-free "No CV
 * on file" exit (no resume -> markManual -> manual_required) immediately
 * after logging APPLICATION_STARTED — before selectProvider(), CV
 * tailoring, or any provider is ever touched. This keeps these tests
 * focused on the route's own duplicate/claim/race handling without needing
 * to mock OpenAI, providers, or Playwright.
 */

const USER_ID = "user-1";
const JOB_ID = "job-1";

interface FakeApplicationRow {
  id: string;
  user_id: string;
  job_id: string;
  status: string;
  company_id: string | null;
  resume_id: string | null;
  match_score: number | null;
  application_method: string;
  manual_required?: boolean;
  error_message?: string | null;
  updated_at: string;
  [key: string]: unknown;
}

interface FakeDbOptions {
  existingApplication?: FakeApplicationRow;
  autoApplyMode?: "auto" | "hybrid" | "review";
  jobApplicationMethod?: string;
  /** Simulate a genuine 23505 on the INSERT path (no existingApplication passed but a row already exists server-side). */
  raceExistingAfterInsertAttempt?: FakeApplicationRow;
}

function makeFakeDb(options: FakeDbOptions = {}) {
  let applicationRow: FakeApplicationRow | null = options.existingApplication ?? null;
  let nextId = 100;
  const events: { event_type: string; metadata: unknown }[] = [];

  function matchesFilters(row: FakeApplicationRow, filters: [string, string, unknown][]): boolean {
    return filters.every(([op, col, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "in") return (val as unknown[]).includes(row[col]);
      return true;
    });
  }

  function applicationsTable() {
    return {
      select() {
        const filters: [string, string, unknown][] = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push(["eq", col, val]);
            return builder;
          },
          in(col: string, vals: unknown[]) {
            filters.push(["in", col, vals]);
            return builder;
          },
          maybeSingle() {
            if (!applicationRow || !matchesFilters(applicationRow, filters)) {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: { ...applicationRow }, error: null });
          },
          single() {
            if (!applicationRow || !matchesFilters(applicationRow, filters)) {
              return Promise.resolve({ data: null, error: { message: "not found" } });
            }
            return Promise.resolve({ data: { ...applicationRow }, error: null });
          },
        };
        return builder;
      },
      insert(payload: Partial<FakeApplicationRow>) {
        return {
          select() {
            return {
              single() {
                if (options.raceExistingAfterInsertAttempt) {
                  applicationRow = options.raceExistingAfterInsertAttempt;
                  return Promise.resolve({
                    data: null,
                    error: { code: "23505", message: 'duplicate key value violates unique constraint "applications_user_id_job_id_key"' },
                  });
                }
                applicationRow = {
                  id: `app-${nextId++}`,
                  user_id: USER_ID,
                  job_id: JOB_ID,
                  status: "queued",
                  company_id: null,
                  resume_id: null,
                  match_score: null,
                  application_method: options.jobApplicationMethod ?? "manual",
                  updated_at: new Date().toISOString(),
                  ...payload,
                } as FakeApplicationRow;
                return Promise.resolve({ data: { ...applicationRow }, error: null });
              },
            };
          },
        };
      },
      update(payload: Partial<FakeApplicationRow>) {
        const filters: [string, string, unknown][] = [];
        function applyIfMatched(): { data: FakeApplicationRow | null; error: { message: string } | null } {
          if (!applicationRow || !matchesFilters(applicationRow, filters)) {
            return { data: null, error: null };
          }
          applicationRow = { ...applicationRow, ...payload, updated_at: new Date().toISOString() };
          return { data: { ...applicationRow }, error: null };
        }
        const builder = {
          eq(col: string, val: unknown) {
            filters.push(["eq", col, val]);
            return builder;
          },
          in(col: string, vals: unknown[]) {
            filters.push(["in", col, vals]);
            return builder;
          },
          select() {
            return builder;
          },
          single() {
            return Promise.resolve(applyIfMatched());
          },
          maybeSingle() {
            return Promise.resolve(applyIfMatched());
          },
          // Real supabase-js query builders are themselves thenable, so
          // `await supabase.from(...).update(...).eq(...)` (no trailing
          // .select()/.single(), used by engine.ts's markManual()) resolves
          // and applies the mutation without ever calling .select(). This
          // fake must do the same, or a bare-awaited update would silently
          // no-op instead of mutating applicationRow.
          then(onFulfilled: (v: { data: FakeApplicationRow | null; error: { message: string } | null }) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(applyIfMatched()).then(onFulfilled, onRejected);
          },
        };
        return builder;
      },
    };
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } } }),
    },
    from(table: string) {
      if (table === "applications") return applicationsTable();
      if (table === "jobs") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              single: async () => ({
                data: {
                  id: JOB_ID,
                  active: true,
                  company_id: null,
                  application_method: options.jobApplicationMethod ?? "manual",
                  application_provider: null,
                  application_email: null,
                  application_url: null,
                  title: "Test Role",
                  company_name: "Test Employer",
                  source: "demo_test",
                },
                error: null,
              }),
            };
          },
        };
      }
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              single: async () => ({
                data: {
                  id: USER_ID,
                  email: "candidate@example.com",
                  full_name: "Test Candidate",
                  auto_apply_mode: options.autoApplyMode ?? "auto",
                  auto_apply_authorized: true,
                  default_resume_id: null,
                },
                error: null,
              }),
            };
          },
        };
      }
      if (table === "job_interactions") {
        return { upsert: async () => ({ data: null, error: null }) };
      }
      if (table === "application_events") {
        return {
          insert(payload: { event_type: string; metadata: unknown }) {
            events.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "notifications") {
        return { insert: async () => ({ data: null, error: null }) };
      }
      if (table === "resumes" || table === "resume_versions") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              single: async () => ({ data: null, error: { message: "not found" } }),
            };
          },
        };
      }
      throw new Error(`makeFakeDb: unexpected table "${table}"`);
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    getApplicationRow: () => applicationRow,
    getEvents: () => events,
  };
}

test("normal swipe: a brand-new application with no existing row reaches engine.run() and resolves to manual_required (no CV on file)", async () => {
  const { client, getApplicationRow } = makeFakeDb({ autoApplyMode: "auto" });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80 });
  const body = await (res as Response).json();

  assert.equal((res as Response).status, 200);
  assert.equal(body.status, "manual_required");
  assert.equal(getApplicationRow()?.status, "manual_required");
});

test("insert race: a Postgres 23505 on the insert path returns a graceful 409, not a 500", async () => {
  const racedRow: FakeApplicationRow = {
    id: "app-raced",
    user_id: USER_ID,
    job_id: JOB_ID,
    status: "queued",
    company_id: null,
    resume_id: null,
    match_score: null,
    application_method: "manual",
    updated_at: new Date().toISOString(),
  };
  const { client } = makeFakeDb({ autoApplyMode: "auto", raceExistingAfterInsertAttempt: racedRow });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80 });
  const body = await (res as Response).json();

  assert.equal((res as Response).status, 409);
  assert.match(body.error, /already applied/i);
  assert.equal(body.application?.id, "app-raced");
});

test("force=true on a submitted application is rejected and never reaches engine.run()", async () => {
  const submitted: FakeApplicationRow = {
    id: "app-submitted",
    user_id: USER_ID,
    job_id: JOB_ID,
    status: "submitted",
    company_id: null,
    resume_id: null,
    match_score: null,
    application_method: "manual",
    updated_at: new Date().toISOString(),
  };
  const { client, getApplicationRow } = makeFakeDb({ autoApplyMode: "auto", existingApplication: submitted });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80, force: true });
  const body = await (res as Response).json();

  assert.equal((res as Response).status, 409);
  assert.match(body.error, /already applied/i);
  // Never touched: status must still be "submitted", never reset to
  // "queued"/"applying" by the terminal-status guard.
  assert.equal(getApplicationRow()?.status, "submitted");
});

test("legitimate retry: force=true on a failed application reuses the SAME application id and processes it once", async () => {
  const failed: FakeApplicationRow = {
    id: "app-failed",
    user_id: USER_ID,
    job_id: JOB_ID,
    status: "failed",
    company_id: null,
    resume_id: null,
    match_score: null,
    application_method: "manual",
    error_message: "previous attempt failed",
    updated_at: new Date().toISOString(),
  };
  const { client, getApplicationRow } = makeFakeDb({ autoApplyMode: "auto", existingApplication: failed });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80, force: true });
  const body = await (res as Response).json();

  assert.equal(body.application.id, "app-failed");
  assert.equal(body.status, "manual_required"); // no CV on file, same as the new-application case
  assert.equal(getApplicationRow()?.id, "app-failed"); // same row, never a new insert
});

test("an actively-applying row is never reclaimed by a force=true request racing it, and reports a safe conflict instead", async () => {
  const applying: FakeApplicationRow = {
    id: "app-applying",
    user_id: USER_ID,
    job_id: JOB_ID,
    status: "applying",
    company_id: null,
    resume_id: null,
    match_score: null,
    application_method: "manual",
    updated_at: new Date().toISOString(), // fresh, not stale
  };
  const { client } = makeFakeDb({ autoApplyMode: "auto", existingApplication: applying });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80, force: true });
  const body = await (res as Response).json();

  assert.equal((res as Response).status, 409);
  assert.equal(body.status, "manual_required");
  assert.match(body.outcome?.reason ?? "", /already being processed/i);
});

test("without force, a queued existing application is reported as already applied, unchanged from before", async () => {
  const queued: FakeApplicationRow = {
    id: "app-queued",
    user_id: USER_ID,
    job_id: JOB_ID,
    status: "queued",
    company_id: null,
    resume_id: null,
    match_score: null,
    application_method: "manual",
    updated_at: new Date().toISOString(),
  };
  const { client } = makeFakeDb({ autoApplyMode: "auto", existingApplication: queued });

  const res = await handleApplyRequest(client, USER_ID, { jobId: JOB_ID, matchScore: 80 });
  const body = await (res as Response).json();

  assert.equal((res as Response).status, 409);
  assert.match(body.error, /already applied/i);
});
