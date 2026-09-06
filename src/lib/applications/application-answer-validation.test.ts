import assert from "node:assert/strict";
import test from "node:test";

import { validateApplicationAnswers } from "./application-answer-validation";
import type { ApplicationPendingQuestion } from "@/lib/types/database";

function question(
  overrides: Partial<ApplicationPendingQuestion> = {}
): ApplicationPendingQuestion {
  return {
    id: "pending-1",
    application_id: "application-1",
    field_id: "relocate",
    question_text: "Would you need to relocate?",
    field_type: "select",
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
    required: true,
    answer_value: null,
    answer_source: null,
    source_answer_library_id: null,
    created_at: "2026-09-06T00:00:00.000Z",
    updated_at: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

test("rejects saving when there are no pending questions", () => {
  const result = validateApplicationAnswers([], {});

  assert.equal(result.ok, false);
  assert.equal(result.error, "No pending questions to answer");
});

test("rejects unknown answer field IDs", () => {
  const result = validateApplicationAnswers(
    [question()],
    { tampered_field: "1" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "Unknown field ID: tampered_field");
});

test("requires an answer for required supported questions", () => {
  const result = validateApplicationAnswers([question()], {});

  assert.equal(result.ok, false);
  assert.equal(result.error, "Answer required for relocate");
});

test("rejects a select value not declared by the provider", () => {
  const result = validateApplicationAnswers(
    [question()],
    { relocate: "definitely" }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "Invalid option for relocate");
});

test("accepts the provider's exact select value and reports it as saved", () => {
  const result = validateApplicationAnswers(
    [question()],
    { relocate: "0" }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.savedFieldIds, ["relocate"]);
});

test("required unsupported file questions remain manual", () => {
  const result = validateApplicationAnswers(
    [
      question({
        field_id: "custom_document",
        field_type: "file",
        options: null,
      }),
    ],
    {}
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    "This required question must be completed manually: custom_document"
  );
});

test("required unsupported boolean questions remain manual", () => {
  const result = validateApplicationAnswers(
    [
      question({
        field_id: "unsupported_boolean",
        field_type: "boolean",
        options: null,
      }),
    ],
    {}
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    "This required question must be completed manually: unsupported_boolean"
  );
});

test("optional unanswered supported questions do not count as saved", () => {
  const result = validateApplicationAnswers(
    [
      question({
        field_id: "portfolio",
        field_type: "text",
        options: null,
        required: false,
      }),
    ],
    {}
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.savedFieldIds, []);
});
