import type { ApplicationPendingQuestion } from "@/lib/types/database";

export interface ApplicationAnswerValidationResult {
  ok: boolean;
  error?: string;
  savedFieldIds?: string[];
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
    }
  }

  return {
    ok: true,
    savedFieldIds,
  };
}
