import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField } from "./types";

/**
 * Keeps public.application_pending_questions in sync with the engine's
 * current view of which required fields on an application can't be
 * safely resolved. Called on every resolution pass (whenever the engine
 * re-evaluates a form — today that's only via the existing admin retry
 * route re-running engine.run(), since no user-facing retry exists yet),
 * so this never accumulates permanent stale blockers:
 *
 *   - Every field in `unresolved` is upserted (insert or refresh its
 *     metadata) — but the upsert deliberately never touches
 *     answer_value/answer_source/source_answer_library_id, so a future
 *     answering phase's data is never clobbered by a metadata refresh.
 *   - Any existing row for this application whose field id is NOT in the
 *     current `unresolved` set is deleted — it was either resolved since
 *     (e.g. the user later added a verified Answer Library entry) or no
 *     longer appears on the employer's form at all. Passing an empty
 *     `unresolved` array (a fully-resolved application) clears every
 *     previously-pending row for it.
 *
 * Only the employer's own question metadata is stored here — no CV
 * content, no generated documents, no candidate answers (Phase 1 never
 * writes answer_value at all).
 */
export async function syncPendingQuestions(
  supabase: SupabaseClient,
  applicationId: string,
  unresolved: { field: FormField }[]
): Promise<void> {
  const currentFieldIds = unresolved.map((u) => u.field.id);

  if (unresolved.length > 0) {
    const rows = unresolved.map((u) => ({
      application_id: applicationId,
      field_id: u.field.id,
      question_text: u.field.label,
      field_type: u.field.type,
      options: u.field.options ?? null,
      required: u.field.required,
    }));
    await supabase.from("application_pending_questions").upsert(rows, { onConflict: "application_id,field_id" });
  }

  const { data: existingRows } = await supabase
    .from("application_pending_questions")
    .select("field_id")
    .eq("application_id", applicationId);
  const staleFieldIds = (existingRows ?? [])
    .map((row) => row.field_id as string)
    .filter((fieldId) => !currentFieldIds.includes(fieldId));

  if (staleFieldIds.length > 0) {
    await supabase
      .from("application_pending_questions")
      .delete()
      .eq("application_id", applicationId)
      .in("field_id", staleFieldIds);
  }
}
