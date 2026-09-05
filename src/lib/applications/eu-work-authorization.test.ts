import { test } from "node:test";
import assert from "node:assert/strict";
import { isEuWideWorkAuthorizationQuestion, resolveEuWorkAuthorizationAnswer } from "./eu-work-authorization";
import type { FormField } from "./types";

// ---- isEuWideWorkAuthorizationQuestion ----

test("isEuWideWorkAuthorizationQuestion: matches the exact confirmed live Greenhouse wording", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("Do you currently have the legal right to work in the European Union?"), true);
});

test("isEuWideWorkAuthorizationQuestion: tolerant of surrounding whitespace and a missing trailing question mark", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("  Do you currently have the legal right to work in the European Union?  "), true);
  assert.equal(isEuWideWorkAuthorizationQuestion("Do you currently have the legal right to work in the European Union"), true);
});

test("isEuWideWorkAuthorizationQuestion: case-insensitive", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("DO YOU CURRENTLY HAVE THE LEGAL RIGHT TO WORK IN THE EUROPEAN UNION?"), true);
});

test("isEuWideWorkAuthorizationQuestion: a Malta-scoped 'legal right to work' phrasing does NOT match — this rule is not broadened to generic wording", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("Do you have the legal right to work in Malta?"), false);
  assert.equal(isEuWideWorkAuthorizationQuestion("Are you authorized to work in Malta?"), false);
});

test("isEuWideWorkAuthorizationQuestion: a similarly-worded but different-jurisdiction question does NOT match", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("Do you currently have the legal right to work in the United Kingdom?"), false);
  assert.equal(isEuWideWorkAuthorizationQuestion("Do you currently have the legal right to work in the United States?"), false);
});

test("isEuWideWorkAuthorizationQuestion: an unrelated question mentioning the European Union does NOT match", () => {
  assert.equal(isEuWideWorkAuthorizationQuestion("Are you willing to relocate within the European Union?"), false);
});

// ---- resolveEuWorkAuthorizationAnswer ----

const cleanYesNoOptions: FormField["options"] = [
  { label: "Yes", value: "1" },
  { label: "No", value: "0" },
];

function euField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: "eu_legal_right",
    label: "Do you currently have the legal right to work in the European Union?",
    type: "select",
    required: true,
    options: cleanYesNoOptions,
    ...overrides,
  };
}

test("resolveEuWorkAuthorizationAnswer: eu_eea_swiss_citizen resolves to the provider's own declared Yes option value", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.deepEqual(outcome, { ok: true, value: "1", sourceEntryId: "wa-entry-1" });
});

test("resolveEuWorkAuthorizationAnswer: never hardcodes '1' — the provider's declared value is returned exactly, whatever it is, and regardless of option order", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(
    euField({
      options: [
        { label: "No", value: "NEEDS_SPONSORSHIP" },
        { label: "Yes", value: "AUTHORIZED_EU_WIDE" },
      ],
    }),
    { workAuthorization: "eu_eea_swiss_citizen", workAuthorizationEntryId: "wa-entry-1" }
  );
  assert.deepEqual(outcome, { ok: true, value: "AUTHORIZED_EU_WIDE", sourceEntryId: "wa-entry-1" });
});

test("resolveEuWorkAuthorizationAnswer: malta_permit_holder stays unresolved — a Malta permit does not establish EU-wide authorization", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: "malta_permit_holder",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "not_established_eu_wide");
});

test("resolveEuWorkAuthorizationAnswer: requires_sponsorship stays unresolved — a Malta-scoped sponsorship need does not establish EU-wide authorization either way", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: "requires_sponsorship",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "not_established_eu_wide");
});

test("resolveEuWorkAuthorizationAnswer: prefer_not_to_say stays unresolved", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: "prefer_not_to_say",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "work_authorization_not_provided");
});

test("resolveEuWorkAuthorizationAnswer: unset/null work authorization stays unresolved", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: null,
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "work_authorization_not_provided");
});

test("resolveEuWorkAuthorizationAnswer: never resolves without a verified work_authorization entry on file, even for eu_eea_swiss_citizen", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField(), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: null,
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "no_verified_work_authorization_entry");
});

test("resolveEuWorkAuthorizationAnswer: an ambiguous options shape (not exactly one Yes and one No) stays unresolved regardless of work authorization", () => {
  const threeOptions = euField({
    options: [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
      { label: "Not sure", value: "2" },
    ],
  });
  const outcome = resolveEuWorkAuthorizationAnswer(threeOptions, {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "eu_work_authorization_options_not_recognized");
});

test("resolveEuWorkAuthorizationAnswer: missing options stays unresolved", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField({ options: undefined }), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "eu_work_authorization_options_not_recognized");
});

test("resolveEuWorkAuthorizationAnswer: an options shape missing one of Yes/No stays unresolved", () => {
  const outcome = resolveEuWorkAuthorizationAnswer(euField({ options: [{ label: "Yes", value: "1" }] }), {
    workAuthorization: "eu_eea_swiss_citizen",
    workAuthorizationEntryId: "wa-entry-1",
  });
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { reason: string }).reason, "eu_work_authorization_options_not_recognized");
});
