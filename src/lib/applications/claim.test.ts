import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimApplicationForProcessing } from "./claim";

interface FakeRow {
  id: string;
  status: string;
  updated_at: string;
  [key: string]: unknown;
}

/**
 * A small, stateful fake modeling exactly one applications row. Filters
 * accumulate across .eq()/.in()/.lt() and are all evaluated together
 * against the CURRENT row state at .maybeSingle() time — this is what lets
 * two sequential claim attempts correctly model a real race: the second
 * attempt's WHERE clause is evaluated against whatever the first attempt
 * already committed, exactly like Postgres row-level locking under
 * READ COMMITTED would behave for two concurrent UPDATEs.
 */
function makeFakeApplicationsClient(initial: FakeRow) {
  let row: FakeRow = { ...initial };

  const client = {
    from(table: string) {
      if (table !== "applications") throw new Error(`unexpected table "${table}"`);
      return {
        update(payload: Record<string, unknown>) {
          const predicates: ((r: FakeRow) => boolean)[] = [];
          const builder = {
            eq(col: string, val: unknown) {
              predicates.push((r) => r[col] === val);
              return builder;
            },
            in(col: string, vals: unknown[]) {
              predicates.push((r) => vals.includes(r[col]));
              return builder;
            },
            lt(col: string, val: string) {
              predicates.push((r) => (r[col] as string) < val);
              return builder;
            },
            select() {
              return builder;
            },
            maybeSingle() {
              const matches = predicates.every((p) => p(row));
              if (!matches) return Promise.resolve({ data: null, error: null });
              row = { ...row, ...payload, updated_at: new Date().toISOString() };
              return Promise.resolve({ data: { ...row }, error: null });
            },
          };
          return builder;
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, getRow: () => row };
}

test("claimApplicationForProcessing: claims a 'queued' application, transitioning it to 'applying'", async () => {
  const { client, getRow } = makeFakeApplicationsClient({ id: "app-1", status: "queued", updated_at: new Date().toISOString() });
  const claimed = await claimApplicationForProcessing(client, "app-1");
  assert.ok(claimed);
  assert.equal(claimed?.status, "applying");
  assert.equal(getRow().status, "applying");
});

test("claimApplicationForProcessing: claims 'manual_required' and 'failed' too", async () => {
  for (const status of ["manual_required", "failed"]) {
    const { client } = makeFakeApplicationsClient({ id: "app-1", status, updated_at: new Date().toISOString() });
    const claimed = await claimApplicationForProcessing(client, "app-1");
    assert.ok(claimed, `expected ${status} to be claimable`);
    assert.equal(claimed?.status, "applying");
  }
});

test("claimApplicationForProcessing: two sequential claim attempts on the same row — only the first succeeds", async () => {
  const { client } = makeFakeApplicationsClient({ id: "app-1", status: "queued", updated_at: new Date().toISOString() });

  const first = await claimApplicationForProcessing(client, "app-1");
  const second = await claimApplicationForProcessing(client, "app-1");

  assert.ok(first, "first claim should succeed");
  assert.equal(second, null, "second claim on the same now-applying row must fail");
});

test("claimApplicationForProcessing: never claims a fresh 'applying' row without allowStaleApplyingOlderThanMs", async () => {
  const { client } = makeFakeApplicationsClient({ id: "app-1", status: "applying", updated_at: new Date().toISOString() });
  const claimed = await claimApplicationForProcessing(client, "app-1");
  assert.equal(claimed, null);
});

test("claimApplicationForProcessing: never claims a RECENT 'applying' row even with allowStaleApplyingOlderThanMs set (not stale yet)", async () => {
  const { client } = makeFakeApplicationsClient({ id: "app-1", status: "applying", updated_at: new Date().toISOString() });
  const claimed = await claimApplicationForProcessing(client, "app-1", { allowStaleApplyingOlderThanMs: 2 * 60 * 1000 });
  assert.equal(claimed, null, "an actively-processing row must never be claimed a second time");
});

test("claimApplicationForProcessing: claims a genuinely stale 'applying' row when allowStaleApplyingOlderThanMs is set", async () => {
  const staleUpdatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
  const { client, getRow } = makeFakeApplicationsClient({ id: "app-1", status: "applying", updated_at: staleUpdatedAt });
  const claimed = await claimApplicationForProcessing(client, "app-1", { allowStaleApplyingOlderThanMs: 2 * 60 * 1000 });
  assert.ok(claimed, "a genuinely stale applying row should be recoverable");
  assert.equal(getRow().status, "applying");
});

test("claimApplicationForProcessing: never claims a 'submitted' row, with or without stale-recovery", async () => {
  const staleUpdatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { client } = makeFakeApplicationsClient({ id: "app-1", status: "submitted", updated_at: staleUpdatedAt });
  const claimed = await claimApplicationForProcessing(client, "app-1", { allowStaleApplyingOlderThanMs: 2 * 60 * 1000 });
  assert.equal(claimed, null);
});

test("claimApplicationForProcessing: a database error is treated as 'not claimed' (fails safe), never throws", async () => {
  const client = {
    from() {
      return {
        update() {
          return {
            eq() {
              return this;
            },
            in() {
              return this;
            },
            select() {
              return this;
            },
            maybeSingle: async () => ({ data: null, error: { message: "connection reset" } }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  const claimed = await claimApplicationForProcessing(client, "app-1");
  assert.equal(claimed, null);
});
