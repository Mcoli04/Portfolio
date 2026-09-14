import type { ApplicationPendingQuestion } from "@/lib/types/database";
import type { FormField } from "./types";

export type ApplicationOnlyAnswerOutcome =
  | { ok: true; value: string }
  | { ok: false; reason: string };

export function normalizeApplicationOnlyAnswer(
  field: FormField,
  pending: ApplicationPendingQuestion
): ApplicationOnlyAnswerOutcome {
  const answer = pending.answer_value?.trim();

  if (!answer) {
    return { ok: false, reason: "missing_application_only_answer" };
  }

  if (field.type === "text" || field.type === "textarea") {
    return { ok: true, value: answer };
  }

  if (field.type === "select") {
    const matchingOption = field.options?.find((option) => option.value === answer);

    if (!matchingOption) {
      return { ok: false, reason: "application_only_select_value_not_current" };
    }

    return { ok: true, value: matchingOption.value };
  }

  return { ok: false, reason: "unsupported_application_only_field_type" };
}