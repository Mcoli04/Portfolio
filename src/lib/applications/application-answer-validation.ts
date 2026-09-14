import type { ApplicationPendingQuestion } from "@/lib/types/database";

export interface ApplicationAnswerValidationResult {
  ok: boolean;
  error?: string;
  savedFieldIds?: string[];
  /** Ready-to-persist (field_id, trimmed answer_value) pairs for save_application_answers_and_requeue(). */
  savedAnswers?: { field_id: string; answer_value: string }[];
}

export function validateApplicationAnswers(
  questions: ApplicationPendingQuestion[],
  answers: Record<string, unknown>
): ApplicationAnswerValidationResult {
  if (questions.length === 0) {
    return {
      ok: false,
      error: "No pending questions to answer",
    };
  }

  const knownFieldIds = new Set(questions.map((question) => question.field_id));
  const submittedFieldIds = Object.keys(answers);

  const unknownFieldId = submittedFieldIds.find(
    (fieldId) => !knownFieldIds.has(fieldId)
  );

  if (unknownFieldId) {
    return {
      ok: false,
      error: `Unknown field ID: ${unknownFieldId}`,
    };
  }

  const savedFieldIds: string[] = [];
  const savedAnswers: { field_id: string; answer_value: string }[] = [];

  for (const question of questions) {
    const rawAnswer = answers[question.field_id];

    if (question.field_type === "file" || question.field_type === "boolean") {
      if (question.required) {
        return {
          ok: false,
          error: `This required question must be completed manually: ${question.field_id}`,
        };
      }

      continue;
    }

    if (
      question.required &&
      (typeof rawAnswer !== "string" || !rawAnswer.trim())
    ) {
      return {
        ok: false,
        error: `Answer required for ${question.field_id}`,
      };
    }

    if (
      question.field_type === "select" &&
      typeof rawAnswer === "string" &&
      rawAnswer.trim()
    ) {
      const options = Array.isArray(question.options) ? question.options : [];
      const valid = options.some((option) => option.value === rawAnswer);

      if (!valid) {
        return {
          ok: false,
          error: `Invalid option for ${question.field_id}`,
        };
      }
    }

    if (
      (question.field_type === "text" ||
        question.field_type === "textarea" ||
        question.field_type === "select") &&
      typeof rawAnswer === "string" &&
      rawAnswer.trim()
    ) {
      savedFieldIds.push(question.field_id);
      savedAnswers.push({ field_id: question.field_id, answer_value: rawAnswer.trim() });
    }
  }

  return {
    ok: true,
    savedFieldIds,
    savedAnswers,
  };
}
