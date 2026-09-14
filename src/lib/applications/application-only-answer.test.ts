import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApplicationOnlyAnswer } from "./application-only-answer";
import type { ApplicationPendingQuestion } from "@/lib/types/database";
import type { FormField } from "./types";

function pendingQuestion(
  overrides: Partial<ApplicationPendingQuestion> = {}
): ApplicationPendingQuestion {
  return {
    id: "pending-1",
    application_id: "application-1",
    field_id: "question-1",
    question_text: "Question",
    field_type: "text",
    options: null,
    required: true,
    answer_value: "My answer",
    answer_source: "application_only",
    source_answer_library_id: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

test("application-only text answers are returned exactly after trimming surrounding whitespace", () => {
  const field: FormField = {
    id: "question-1",
    label: "Tell us about yourself",
    type: "text",
    required: true,
  };

  const result = normalizeApplicationOnlyAnswer(
    field,
    pendingQuestion({ answer_value: "  My exact answer  " })
  );

  assert.deepEqual(result, {
    ok: true,
    value: "My exact answer",
  });
});

test("application-only select answers must exactly match a current provider option value", () => {
  const field: FormField = {
    id: "question-1",
    label: "Would you need to relocate?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };

  const result = normalizeApplicationOnlyAnswer(
    field,
    pendingQuestion({
      field_type: "select",
      answer_value: "1",
      options: field.options ?? null,
    })
  );

  assert.deepEqual(result, {
    ok: true,
    value: "1",
  });
});

test("application-only select answers reject stale or tampered values", () => {
  const field: FormField = {
    id: "question-1",
    label: "Would you need to relocate?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };

  const result = normalizeApplicationOnlyAnswer(
    field,
    pendingQuestion({
      field_type: "select",
      answer_value: "yes",
      options: field.options ?? null,
    })
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "application_only_select_value_not_current",
  });
});

test("empty application-only answers are never accepted", () => {
  const field: FormField = {
    id: "question-1",
    label: "Question",
    type: "textarea",
    required: true,
  };

  const result = normalizeApplicationOnlyAnswer(
    field,
    pendingQuestion({
      field_type: "textarea",
      answer_value: "   ",
    })
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "missing_application_only_answer",
  });
});

test("unsupported application-only field types are never guessed", () => {
  const field: FormField = {
    id: "question-1",
    label: "Upload another document",
    type: "file",
    required: true,
  };

  const result = normalizeApplicationOnlyAnswer(
    field,
    pendingQuestion({
      field_type: "file",
      answer_value: "some-value",
    })
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "unsupported_application_only_field_type",
  });
});