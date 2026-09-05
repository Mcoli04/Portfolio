import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapGreenhouseQuestionToFormFields,
  mapGreenhouseFormResponse,
  extractGreenhouseBoardToken,
  type GreenhouseQuestion,
} from "./greenhouse-form-mapping";
import { isHardBlockedQuestion } from "@/lib/ai/answer-questions";

function question(overrides: Partial<GreenhouseQuestion> = {}): GreenhouseQuestion {
  return {
    id: 1,
    label: "Question label",
    required: false,
    fields: [],
    ...overrides,
  };
}

// ---- standard identity fields ----

test("mapGreenhouseQuestionToFormFields: standard identity field names map to exact roles, never fuzzy label matching", () => {
  const q = question({
    id: 10,
    label: "First Name",
    required: true,
    fields: [{ name: "first_name", type: "input_text" }],
  });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.id, "first_name");
  assert.equal(field.role, "first_name");
  assert.equal(field.type, "text");
  assert.equal(field.required, true);
});

for (const [name, role] of [
  ["first_name", "first_name"],
  ["last_name", "last_name"],
  ["email", "email"],
  ["phone", "phone"],
] as const) {
  test(`mapGreenhouseQuestionToFormFields: standard field "${name}" maps to role "${role}"`, () => {
    const q = question({ fields: [{ name, type: "input_text" }] });
    const [field] = mapGreenhouseQuestionToFormFields(q);
    assert.equal(field.role, role);
    assert.equal(field.type, "text");
  });
}

test("mapGreenhouseQuestionToFormFields: required is taken exactly from the question, never guessed", () => {
  const requiredQ = question({ required: true, fields: [{ name: "phone", type: "input_text" }] });
  const optionalQ = question({ required: false, fields: [{ name: "phone", type: "input_text" }] });
  assert.equal(mapGreenhouseQuestionToFormFields(requiredQ)[0].required, true);
  assert.equal(mapGreenhouseQuestionToFormFields(optionalQ)[0].required, false);
});

// ---- resume / resume_text pairing ----

test("mapGreenhouseQuestionToFormFields: a Resume question with both resume (input_file) and resume_text (textarea) fields emits exactly one role:'resume' field", () => {
  const q = question({
    id: 20,
    label: "Resume",
    required: true,
    fields: [
      { name: "resume", type: "input_file" },
      { name: "resume_text", type: "textarea" },
    ],
  });
  const fields = mapGreenhouseQuestionToFormFields(q);
  assert.equal(fields.length, 1, "resume_text must never become its own screening question");
  assert.equal(fields[0].id, "resume");
  assert.equal(fields[0].role, "resume");
  assert.equal(fields[0].type, "file");
  assert.equal(fields[0].required, true);
});

test("mapGreenhouseQuestionToFormFields: cover_letter maps to role 'cover_letter', type 'file'", () => {
  const q = question({ fields: [{ name: "cover_letter", type: "input_file" }] });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.role, "cover_letter");
  assert.equal(field.type, "file");
});

test("mapGreenhouseQuestionToFormFields: resume_text alone (no sibling resume field) is still never a screening question — a required lone resume_text becomes an unsupported placeholder", () => {
  const q = question({ id: 21, required: true, fields: [{ name: "resume_text", type: "textarea" }] });
  const fields = mapGreenhouseQuestionToFormFields(q);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].type, "select");
  assert.equal(fields[0].options, undefined, "must never be answerable — no options declared");
  assert.equal(fields[0].role, undefined);
});

test("mapGreenhouseQuestionToFormFields: resume_text alone, optional, produces no fields at all", () => {
  const q = question({ required: false, fields: [{ name: "resume_text", type: "textarea" }] });
  assert.deepEqual(mapGreenhouseQuestionToFormFields(q), []);
});

// ---- multi_value_single_select ----

test("mapGreenhouseQuestionToFormFields: multi_value_single_select options come only from provider-declared values", () => {
  const q = question({
    id: 30,
    label: "Are you willing to relocate?",
    required: true,
    fields: [
      {
        name: "question_30",
        type: "multi_value_single_select",
        values: [
          { label: "Yes", value: 1 },
          { label: "No", value: 2 },
        ],
      },
    ],
  });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.id, "question_30");
  assert.equal(field.type, "select");
  assert.deepEqual(field.options, ["Yes", "No"]);
  assert.equal(field.role, undefined, "a custom question defaults to screening_question");
});

test("mapGreenhouseQuestionToFormFields: multi_value_single_select with no declared values is never emitted with invented options", () => {
  const q = question({ id: 31, required: true, fields: [{ name: "question_31", type: "multi_value_single_select", values: [] }] });
  const fields = mapGreenhouseQuestionToFormFields(q);
  // Falls through to the required-question-with-no-safe-field fallback.
  assert.equal(fields.length, 1);
  assert.equal(fields[0].options, undefined);
});

// ---- multi_value_multi_select: unsupported ----

test("mapGreenhouseQuestionToFormFields: multi_value_multi_select never gets options populated, even when the provider declares values", () => {
  const q = question({
    id: 40,
    required: true,
    fields: [
      {
        name: "question_40",
        type: "multi_value_multi_select",
        values: [
          { label: "Option A", value: 1 },
          { label: "Option B", value: 2 },
        ],
      },
    ],
  });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.type, "select");
  assert.equal(field.options, undefined, "multi-select is unsupported and must never be treated as answerable");
  assert.equal(field.required, true);
});

test("mapGreenhouseQuestionToFormFields: an optional multi_value_multi_select maps to a field with no options, allowing it to be safely omitted", () => {
  const q = question({ required: false, fields: [{ name: "question_41", type: "multi_value_multi_select", values: [{ label: "A", value: 1 }] }] });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.options, undefined);
  assert.equal(field.required, false);
});

// ---- input_hidden ----

test("mapGreenhouseQuestionToFormFields: input_hidden is never emitted as an answerable field", () => {
  const q = question({ fields: [{ name: "source", type: "input_hidden" }] });
  assert.deepEqual(mapGreenhouseQuestionToFormFields(q), []);
});

test("mapGreenhouseQuestionToFormFields: a required question consisting only of an input_hidden field still safely forces manual review, never silently vanishes", () => {
  const q = question({ id: 50, required: true, fields: [{ name: "source", type: "input_hidden" }] });
  const fields = mapGreenhouseQuestionToFormFields(q);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].id, "gh_question_50");
  assert.equal(fields[0].type, "select");
  assert.equal(fields[0].options, undefined);
  assert.equal(fields[0].required, true);
});

test("mapGreenhouseQuestionToFormFields: input_hidden alongside other real fields is skipped, siblings still mapped normally", () => {
  const q = question({
    required: true,
    fields: [
      { name: "source", type: "input_hidden" },
      { name: "phone", type: "input_text" },
    ],
  });
  const fields = mapGreenhouseQuestionToFormFields(q);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].role, "phone");
});

// ---- unknown/unrecognized field types ----

test("mapGreenhouseQuestionToFormFields: an unrecognized field type is never coerced into a type we understand", () => {
  const q = question({ id: 60, required: true, fields: [{ name: "question_60", type: "date_picker" }] });
  const fields = mapGreenhouseQuestionToFormFields(q);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].id, "gh_question_60");
  assert.equal(fields[0].options, undefined, "unsupported placeholder, never a guessed type");
});

test("mapGreenhouseQuestionToFormFields: an optional question with only an unrecognized field type produces no fields", () => {
  const q = question({ required: false, fields: [{ name: "question_61", type: "date_picker" }] });
  assert.deepEqual(mapGreenhouseQuestionToFormFields(q), []);
});

// ---- deterministic, provider-declared field ids ----

test("mapGreenhouseQuestionToFormFields: field id is always the Greenhouse-declared field name, never invented", () => {
  const q = question({ fields: [{ name: "question_99887766", type: "input_text" }] });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.id, "question_99887766");
});

// ---- compliance/EEO questions stay screening questions, hard-block still applies downstream ----

test("mapGreenhouseQuestionToFormFields: an EEO/demographic question maps as an ordinary screening question (no special-casing in the mapper) — hard-block still recognizes its label", () => {
  const q = question({
    id: 70,
    label: "Voluntary Self-Identification of Disability",
    required: false,
    fields: [
      {
        name: "question_70",
        type: "multi_value_single_select",
        values: [
          { label: "Yes, I have a disability", value: 1 },
          { label: "No, I do not have a disability", value: 2 },
          { label: "I do not want to answer", value: 3 },
        ],
      },
    ],
  });
  const [field] = mapGreenhouseQuestionToFormFields(q);
  assert.equal(field.role, undefined);
  assert.equal(field.type, "select");
  // The mapper doesn't hard-block anything itself — that guarantee lives
  // in answerQuestion()/isHardBlockedQuestion, applied to whatever label
  // this mapper produces. This just confirms the label it produces is
  // still recognized by that existing safeguard.
  assert.equal(isHardBlockedQuestion(field.label), true);
});

// ---- full response mapping ----

test("mapGreenhouseFormResponse: flattens all questions' fields and sets requiresHumanVerification conservatively false", () => {
  const form = mapGreenhouseFormResponse({
    id: 1,
    questions: [
      { id: 1, label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
      { id: 2, label: "Email", required: true, fields: [{ name: "email", type: "input_text" }] },
    ],
  });
  assert.equal(form.fields.length, 2);
  assert.equal(form.requiresHumanVerification, false);
});

test("mapGreenhouseFormResponse: a response with no questions produces an empty field list, not null", () => {
  const form = mapGreenhouseFormResponse({ id: 1, questions: [] });
  assert.deepEqual(form.fields, []);
});

test("mapGreenhouseFormResponse: a response with questions omitted entirely is handled without throwing", () => {
  const form = mapGreenhouseFormResponse({ id: 1 });
  assert.deepEqual(form.fields, []);
});

// ---- board token extraction ----

test("extractGreenhouseBoardToken: extracts the token from job-boards.greenhouse.io URLs", () => {
  assert.equal(extractGreenhouseBoardToken("https://job-boards.greenhouse.io/betsson/jobs/123456"), "betsson");
});

test("extractGreenhouseBoardToken: extracts the token from the older boards.greenhouse.io host", () => {
  assert.equal(extractGreenhouseBoardToken("https://boards.greenhouse.io/betsson/jobs/123456"), "betsson");
});

test("extractGreenhouseBoardToken: rejects a lookalike host that merely ends with the string 'greenhouse.io'", () => {
  assert.equal(extractGreenhouseBoardToken("https://evilgreenhouse.io/betsson/jobs/123456"), null);
});

test("extractGreenhouseBoardToken: rejects non-greenhouse hosts entirely", () => {
  assert.equal(extractGreenhouseBoardToken("https://example.com/betsson/jobs/123456"), null);
});

test("extractGreenhouseBoardToken: returns null for a malformed URL or no URL at all", () => {
  assert.equal(extractGreenhouseBoardToken("not a url"), null);
  assert.equal(extractGreenhouseBoardToken(null), null);
  assert.equal(extractGreenhouseBoardToken(""), null);
});

test("extractGreenhouseBoardToken: returns null when the path has no token segment", () => {
  assert.equal(extractGreenhouseBoardToken("https://job-boards.greenhouse.io/"), null);
});
