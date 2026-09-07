import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAnswerForField, resolveWorkAuthorizationBoolean } from "./answer-normalization";
import type { QuestionAnswer } from "@/lib/ai/answer-questions";
import type { FormField } from "./types";

function matched(overrides: Partial<QuestionAnswer> = {}): QuestionAnswer {
  return { answer: "some answer", manualRequired: false, sourceEntryId: "entry-1", ...overrides };
}

function unmatched(): QuestionAnswer {
  return { answer: null, manualRequired: true, reason: "unmatched" };
}

// ---- resolveWorkAuthorizationBoolean ----

test("resolveWorkAuthorizationBoolean: positive-authorization phrasing, EU/EEA/Swiss citizen -> true", () => {
  assert.equal(
    resolveWorkAuthorizationBoolean("Are you legally authorized to work in Malta without sponsorship?", "eu_eea_swiss_citizen"),
    true
  );
});

test("resolveWorkAuthorizationBoolean: positive-authorization phrasing, permit holder -> true", () => {
  assert.equal(resolveWorkAuthorizationBoolean("Do you have the right to work in Malta?", "malta_permit_holder"), true);
});

test("resolveWorkAuthorizationBoolean: positive-authorization phrasing, requires sponsorship -> false", () => {
  assert.equal(
    resolveWorkAuthorizationBoolean("Are you authorized to work in this location without a visa?", "requires_sponsorship"),
    false
  );
});

test("resolveWorkAuthorizationBoolean: OPPOSITE polarity — sponsorship-required phrasing, EU/EEA/Swiss citizen -> false", () => {
  // Same fact as the first test, opposite question framing, must flip.
  assert.equal(
    resolveWorkAuthorizationBoolean("Will you now or in the future require sponsorship to work here?", "eu_eea_swiss_citizen"),
    false
  );
});

test("resolveWorkAuthorizationBoolean: OPPOSITE polarity — sponsorship-required phrasing, permit holder -> false", () => {
  assert.equal(resolveWorkAuthorizationBoolean("Do you require work permit sponsorship?", "malta_permit_holder"), false);
});

test("resolveWorkAuthorizationBoolean: OPPOSITE polarity — sponsorship-required phrasing, requires sponsorship -> true", () => {
  assert.equal(resolveWorkAuthorizationBoolean("Do you need visa sponsorship to work here?", "requires_sponsorship"), true);
});

test("resolveWorkAuthorizationBoolean: prefer_not_to_say never resolves, regardless of phrasing", () => {
  assert.equal(resolveWorkAuthorizationBoolean("Are you authorized to work without sponsorship?", "prefer_not_to_say"), null);
  assert.equal(resolveWorkAuthorizationBoolean("Do you require sponsorship?", "prefer_not_to_say"), null);
});

test("resolveWorkAuthorizationBoolean: unset work authorization never resolves", () => {
  assert.equal(resolveWorkAuthorizationBoolean("Are you authorized to work without sponsorship?", null), null);
});

test("resolveWorkAuthorizationBoolean: unrecognized/ambiguous phrasing never resolves, even with a substantive answer on file", () => {
  assert.equal(resolveWorkAuthorizationBoolean("What is your visa status?", "eu_eea_swiss_citizen"), null);
  assert.equal(resolveWorkAuthorizationBoolean("Please describe your work eligibility situation.", "requires_sponsorship"), null);
});

// ---- normalizeAnswerForField: text/textarea ----

test("normalizeAnswerForField: text/textarea fields pass the resolved answer through unchanged", () => {
  const field: FormField = { id: "f1", label: "What is your notice period?", type: "text", required: true };
  const outcome = normalizeAnswerForField(field, matched({ answer: "One month.", sourceEntryId: "notice-1" }), {
    workAuthorization: null,
    workAuthorizationEntryId: null,
  });
  assert.deepEqual(outcome, { ok: true, value: "One month.", sourceEntryId: "notice-1" });
});

test("normalizeAnswerForField: no match at all is never normalized (text field)", () => {
  const field: FormField = { id: "f1", label: "What is your notice period?", type: "text", required: true };
  const outcome = normalizeAnswerForField(field, unmatched(), { workAuthorization: null, workAuthorizationEntryId: null });
  assert.equal(outcome.ok, false);
});

test("normalizeAnswerForField: a hard-blocked question's reason is preserved through to the outcome, for any field type", () => {
  const hardBlocked: QuestionAnswer = { answer: null, manualRequired: true, reason: "hard_blocked" };
  const textField: FormField = { id: "f1", label: "Have you ever been convicted of a criminal offence?", type: "text", required: true };
  const textOutcome = normalizeAnswerForField(textField, hardBlocked, { workAuthorization: null, workAuthorizationEntryId: null });
  assert.equal(textOutcome.ok, false);
  assert.equal((textOutcome as { reason: string }).reason, "hard_blocked");

  const booleanField: FormField = { id: "f2", label: "Have you ever been convicted of a criminal offence?", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" };
  const booleanOutcome = normalizeAnswerForField(booleanField, hardBlocked, { workAuthorization: "eu_eea_swiss_citizen", workAuthorizationEntryId: "wa-1" });
  assert.equal(booleanOutcome.ok, false);
  assert.equal((booleanOutcome as { reason: string }).reason, "hard_blocked");
});

// ---- normalizeAnswerForField: boolean ----

test("normalizeAnswerForField: boolean field with an undeclared true/false representation can never be normalized", () => {
  const field: FormField = { id: "f1", label: "Are you authorized to work without sponsorship?", type: "boolean", required: true };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "boolean_representation_undeclared");
});

test("normalizeAnswerForField: boolean work-authorization field resolves to the provider's declared true/false values", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you authorized to work in this location without sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "Yes",
    falseValue: "No",
  };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "Yes", sourceEntryId: "wa-1" });
});

test("normalizeAnswerForField: OPPOSITE polarity boolean question is answered correctly for the same fact", () => {
  const field: FormField = {
    id: "f1",
    label: "Will you now or in the future require sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "true",
    falseValue: "false",
  };
  // Same underlying fact (EU/EEA/Swiss citizen) as the previous test, but
  // this question's polarity is inverted — "true" here means "yes I need
  // sponsorship", so the correct answer flips to false.
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "false", sourceEntryId: "wa-1" });
});

test("normalizeAnswerForField: boolean field uses whatever literal values the provider declared, never a hardcoded Yes/No", () => {
  const field: FormField = {
    id: "f1",
    label: "Will you now or in the future require sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "REQUIRES_SPONSORSHIP",
    falseValue: "NO_SPONSORSHIP_NEEDED",
  };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "requires_sponsorship",
    workAuthorizationEntryId: "wa-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "REQUIRES_SPONSORSHIP", sourceEntryId: "wa-1" });
});

test("normalizeAnswerForField: boolean field never resolves without a verified work_authorization entry on file", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you authorized to work in this location without sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "Yes",
    falseValue: "No",
  };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: null,
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "no_verified_work_authorization_entry");
});

test("normalizeAnswerForField: boolean field never coerces a free-text question (e.g. relocation) into yes/no", () => {
  const field: FormField = { id: "f1", label: "Are you willing to relocate?", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" };
  const outcome = normalizeAnswerForField(field, matched({ answer: "Open to relocating within Malta", sourceEntryId: "relo-1" }), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "unrecognized_work_authorization_phrasing");
});

test("normalizeAnswerForField: boolean field with unrecognized/ambiguous wording is never guessed", () => {
  const field: FormField = { id: "f1", label: "Please describe your work eligibility.", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "unrecognized_work_authorization_phrasing");
});

test("normalizeAnswerForField: boolean field with prefer_not_to_say authorization is never guessed", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you authorized to work in this location without sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "Yes",
    falseValue: "No",
  };
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "prefer_not_to_say",
    workAuthorizationEntryId: "wa-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "work_authorization_not_provided");
});

test("normalizeAnswerForField: boolean field with unset authorization is never guessed", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you authorized to work in this location without sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "Yes",
    falseValue: "No",
  };
  const outcome = normalizeAnswerForField(field, unmatched(), { workAuthorization: null, workAuthorizationEntryId: "wa-1" });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "work_authorization_not_provided");
});

// ---- normalizeAnswerForField: select ----

test("normalizeAnswerForField: select field accepts only an exact case/whitespace-insensitive match against declared option labels, and returns the provider's own option value", () => {
  const field: FormField = {
    id: "f1",
    label: "Notice period",
    type: "select",
    required: true,
    options: [
      { label: "2 weeks", value: "2 weeks" },
      { label: "1 Month", value: "1 Month" },
      { label: "3 months", value: "3 months" },
    ],
  };
  const outcome = normalizeAnswerForField(field, matched({ answer: "  1 month  ", sourceEntryId: "notice-1" }), {
    workAuthorization: null,
    workAuthorizationEntryId: null,
  });
  assert.deepEqual(outcome, { ok: true, value: "1 Month", sourceEntryId: "notice-1" });
});

test("normalizeAnswerForField: select field returns the provider's declared value even when it differs from the label (e.g. Greenhouse's numeric option values)", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you willing to relocate?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };
  const outcome = normalizeAnswerForField(field, matched({ answer: "Yes", sourceEntryId: "relo-1" }), {
    workAuthorization: null,
    workAuthorizationEntryId: null,
  });
  assert.deepEqual(outcome, { ok: true, value: "1", sourceEntryId: "relo-1" });
});

test("normalizeAnswerForField: select field with no matching option is never fuzzily matched", () => {
  const field: FormField = {
    id: "f1",
    label: "Notice period",
    type: "select",
    required: true,
    options: [
      { label: "2 weeks", value: "2 weeks" },
      { label: "1 month", value: "1 month" },
      { label: "3 months", value: "3 months" },
    ],
  };
  const outcome = normalizeAnswerForField(field, matched({ answer: "6 weeks" }), { workAuthorization: null, workAuthorizationEntryId: null });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "no_matching_option");
});

test("normalizeAnswerForField: select field with no declared options can never be safely normalized", () => {
  const field: FormField = { id: "f1", label: "Notice period", type: "select", required: true, options: [] };
  const outcome = normalizeAnswerForField(field, matched({ answer: "1 month" }), { workAuthorization: null, workAuthorizationEntryId: null });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "no_declared_options");
});

// ---- normalizeAnswerForField: EU-wide work-authorization select (delegates to eu-work-authorization.ts) ----

test("normalizeAnswerForField: the confirmed EU-wide select question resolves from profile.work_authorization, entirely bypassing the Answer Library match", () => {
  const field: FormField = {
    id: "eu_legal_right",
    label: "Do you currently have the legal right to work in the European Union?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };
  // `resolved` deliberately carries a free-text sentence, like the real
  // work_authorization Answer Library entry would — it must never be
  // consulted for this field; only the structured profile fact is used.
  const outcome = normalizeAnswerForField(
    field,
    matched({ answer: "I am an EU/EEA/Swiss citizen and do not require a visa or work permit to work in Malta.", sourceEntryId: "free-text-entry" }),
    { workAuthorization: "eu_eea_swiss_citizen", workAuthorizationEntryId: "wa-entry-1" }
  );
  assert.deepEqual(outcome, { ok: true, value: "1", sourceEntryId: "wa-entry-1" });
});

test("normalizeAnswerForField: the confirmed EU-wide select question stays unresolved for malta_permit_holder, even with a matched free-text answer on file", () => {
  const field: FormField = {
    id: "eu_legal_right",
    label: "Do you currently have the legal right to work in the European Union?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };
  const outcome = normalizeAnswerForField(field, matched({ answer: "I already hold a valid work permit/visa for Malta." }), {
    workAuthorization: "malta_permit_holder",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "not_established_eu_wide");
});

test("normalizeAnswerForField: a Malta-scoped boolean work-authorization field is unaffected by the new EU-wide select rule", () => {
  const field: FormField = {
    id: "f1",
    label: "Are you authorized to work in this location without sponsorship?",
    type: "boolean",
    required: true,
    trueValue: "Yes",
    falseValue: "No",
  };
  // malta_permit_holder is correctly "Yes" for this Malta-scoped boolean
  // question — proving the new EU-wide branch (which would reject
  // malta_permit_holder) was never reached for a boolean field.
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "malta_permit_holder",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "Yes", sourceEntryId: "wa-entry-1" });
});

test("normalizeAnswerForField: a similarly-worded but non-EU select question (e.g. Malta-scoped) does not hit the EU-specific rule and falls through to ordinary select matching", () => {
  const field: FormField = {
    id: "f1",
    label: "Do you have the legal right to work in Malta?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };
  // No Answer Library match for this exact wording — proves it went
  // through the generic select path (which requires resolved.answer to
  // match a declared option label), not the structured EU-wide resolver
  // (which would have resolved malta_permit_holder to "not_established_eu_wide",
  // a different failure reason).
  const outcome = normalizeAnswerForField(field, unmatched(), {
    workAuthorization: "malta_permit_holder",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "unmatched");
});

test("normalizeAnswerForField: the relocation question (Yes/No select) is untouched by the EU-wide rule", () => {
  const field: FormField = {
    id: "f1",
    label: "Would you need to relocate in order to perform this role?",
    type: "select",
    required: true,
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ],
  };
  const outcome = normalizeAnswerForField(field, matched({ answer: "No", sourceEntryId: "relo-1" }), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "0", sourceEntryId: "relo-1" });
});
