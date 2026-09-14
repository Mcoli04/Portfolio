import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveApplicationAnswersAndRequeue } from "./save-application-answers";

function createFakeSupabase(rpcError: { message: string } | null): {
  client: SupabaseClient;
  calls: { name: string; params: unknown }[];
} {
  const calls: { name: string; params: unknown }[] = [];
  const client = {
    rpc(name: string, params: unknown) {
      calls.push({ name, params });
      return Promise.resolve({ data: null, error: rpcError });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("saveApplicationAnswersAndRequeue: success calls the RPC with the application id and answers, returns ok", async () => {
  const { client, calls } = createFakeSupabase(null);

  const result = await saveApplicationAnswersAndRequeue(client, "app-1", [
    { field_id: "relocate", answer_value: "0" },
  ]);

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "save_application_answers_and_requeue");
  assert.deepEqual(calls[0].params, {
    p_application_id: "app-1",
    p_answers: [{ field_id: "relocate", answer_value: "0" }],
  });
});

test("saveApplicationAnswersAndRequeue: maps application_not_found to reason not_found", async () => {
  const { client } = createFakeSupabase({ message: "application_not_found" });

  const result = await saveApplicationAnswersAndRequeue(client, "app-1", []);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

test("saveApplicationAnswersAndRequeue: maps application_not_manual_required to reason not_manual_required", async () => {
  const { client } = createFakeSupabase({ message: "application_not_manual_required" });

  const result = await saveApplicationAnswersAndRequeue(client, "app-1", []);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_manual_required");
});

test("saveApplicationAnswersAndRequeue: maps application_has_unanswered_required_questions to reason unanswered_required_questions", async () => {
  const { client } = createFakeSupabase({ message: "application_has_unanswered_required_questions" });

  const result = await saveApplicationAnswersAndRequeue(client, "app-1", []);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unanswered_required_questions");
});

test("saveApplicationAnswersAndRequeue: maps an unrecognized database error to db_error, preserving the message", async () => {
  const { client } = createFakeSupabase({ message: "connection reset by peer" });

  const result = await saveApplicationAnswersAndRequeue(client, "app-1", []);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "db_error");
    assert.equal(result.message, "connection reset by peer");
  }
});
