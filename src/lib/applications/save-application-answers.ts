import type { SupabaseClient } from "@supabase/supabase-js";

export type SaveApplicationAnswersResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "not_manual_required" | "unanswered_required_questions" | "db_error";
      message: string;
    };

/**
 * Atomically persists validated application-only answers and requeues the
 * application for retry, via the save_application_answers_and_requeue()
 * Postgres function (supabase/migrations/0010_save_application_answers_and_requeue.sql).
 * All writes happen in one database transaction — either every answer is
 * saved and the application transitions to "queued", or nothing changes at
 * all. Callers are expected to have already run the submitted answers
 * through validateApplicationAnswers(); this wrapper does not re-validate
 * field types/options/required-ness, it only shapes and forwards the RPC
 * call and translates the function's known failure modes — including
 * "unanswered_required_questions", the RPC's own structural check that a
 * direct/bypassing caller hasn't left a required pending question with no
 * answer_value (see the migration for why this doesn't duplicate the
 * route's full validation).
 */
export async function saveApplicationAnswersAndRequeue(
  supabase: SupabaseClient,
  applicationId: string,
  answers: { field_id: string; answer_value: string }[]
): Promise<SaveApplicationAnswersResult> {
  const { error } = await supabase.rpc("save_application_answers_and_requeue", {
    p_application_id: applicationId,
    p_answers: answers,
  });

  if (!error) {
    return { ok: true };
  }

  if (error.message.includes("application_not_found")) {
    return { ok: false, reason: "not_found", message: error.message };
  }

  if (error.message.includes("application_not_manual_required")) {
    return { ok: false, reason: "not_manual_required", message: error.message };
  }

  if (error.message.includes("application_has_unanswered_required_questions")) {
    return { ok: false, reason: "unanswered_required_questions", message: error.message };
  }

  return { ok: false, reason: "db_error", message: error.message };
}
