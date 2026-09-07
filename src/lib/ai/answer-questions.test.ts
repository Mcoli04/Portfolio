import { test } from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, isHardBlockedQuestion } from "./answer-questions";
import type { AnswerLibraryEntry } from "@/lib/types/database";

function entry(overrides: Partial<AnswerLibraryEntry> = {}): AnswerLibraryEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    question_key: "custom_a",
    question_text: "Do you have a driving licence?",
    answer_text: "Yes, full clean licence.",
    answer_type: "text",
    verified: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

test("answerQuestion: matches a verified question_key entry and reports its source id", async () => {
  const library = [entry({ id: "wa-1", question_key: "work_authorization", question_text: "Are you authorized to work here?", answer_text: "I am an EU citizen." })];
  const result = await answerQuestion("Do you have the right to work in this location?", library);
  assert.equal(result.answer, "I am an EU citizen.");
  assert.equal(result.manualRequired, false);
  assert.equal(result.sourceEntryId, "wa-1");
});

test("answerQuestion: matches a verified entry by exact question text", async () => {
  const library = [entry({ id: "custom-1" })];
  const result = await answerQuestion("do you have a driving licence?  ", library);
  assert.equal(result.answer, "Yes, full clean licence.");
  assert.equal(result.sourceEntryId, "custom-1");
});

test("answerQuestion: never uses an unverified entry, even with an identical question", async () => {
  const library = [entry({ id: "unverified-1", verified: false })];
  const result = await answerQuestion("Do you have a driving licence?", library);
  assert.equal(result.answer, null);
  assert.equal(result.manualRequired, true);
  assert.equal(result.reason, "unmatched");
  assert.equal(result.sourceEntryId, undefined);
});

test("answerQuestion: no match at all returns manualRequired with no fabricated answer", async () => {
  const result = await answerQuestion("What is your favorite color?", []);
  assert.equal(result.answer, null);
  assert.equal(result.manualRequired, true);
  assert.equal(result.reason, "unmatched");
});

test("isHardBlockedQuestion: flags criminal record / background check questions", () => {
  assert.equal(isHardBlockedQuestion("Have you ever been convicted of a criminal offence?"), true);
  assert.equal(isHardBlockedQuestion("Do you consent to a background check?"), true);
});

test("isHardBlockedQuestion: flags EEO / demographic self-identification questions", () => {
  assert.equal(isHardBlockedQuestion("Please select your race/ethnicity (voluntary self-identification)"), true);
  assert.equal(isHardBlockedQuestion("What is your gender identity?"), true);
  assert.equal(isHardBlockedQuestion("What is your sexual orientation?"), true);
  assert.equal(isHardBlockedQuestion("Do you have a disability?"), true);
  assert.equal(isHardBlockedQuestion("Are you a protected veteran? (veteran status)"), true);
});

test("isHardBlockedQuestion: does not flag ordinary work-authorization or logistics questions", () => {
  assert.equal(isHardBlockedQuestion("Are you authorized to work in Malta?"), false);
  assert.equal(isHardBlockedQuestion("What is your notice period?"), false);
  assert.equal(isHardBlockedQuestion("What is your expected salary?"), false);
});

test("answerQuestion: hard-blocked questions are never auto-answered, even with a matching verified entry", async () => {
  const library = [
    entry({
      id: "trap-1",
      question_key: "custom_criminal",
      question_text: "Have you ever been convicted of a criminal offence?",
      answer_text: "No.",
      verified: true,
    }),
  ];
  const result = await answerQuestion("Have you ever been convicted of a criminal offence?", library);
  assert.equal(result.answer, null);
  assert.equal(result.manualRequired, true);
  assert.equal(result.reason, "hard_blocked");
  assert.equal(result.sourceEntryId, undefined);
});

test("answerQuestion: hard-blocked check runs even for a question_key regex match (work_authorization key can't rescue a demographic question)", async () => {
  // Defense-in-depth: a hypothetical mis-tagged library entry must not let a
  // demographic/EEO question slip through just because it happens to share
  // a common question_key.
  const library = [entry({ id: "mis-tagged", question_key: "work_authorization", answer_text: "I am an EU citizen." })];
  const result = await answerQuestion("What is your gender identity? (EEO self-identification)", library);
  assert.equal(result.answer, null);
  assert.equal(result.manualRequired, true);
  assert.equal(result.reason, "hard_blocked");
});

// ---- real Betsson-style label regression coverage ----

test("answerQuestion: real Betsson label 'LinkedIn Profile' resolves to the verified linkedin_url entry", async () => {
  const library = [entry({ id: "li-1", question_key: "linkedin_url", question_text: "What is your LinkedIn profile URL?", answer_text: "https://linkedin.com/in/mariaborg" })];
  const result = await answerQuestion("LinkedIn Profile", library);
  assert.equal(result.answer, "https://linkedin.com/in/mariaborg");
  assert.equal(result.sourceEntryId, "li-1");
});

test("answerQuestion: real Betsson label 'Website' resolves to the verified portfolio_url entry", async () => {
  const library = [entry({ id: "pf-1", question_key: "portfolio_url", question_text: "Do you have a portfolio or personal website?", answer_text: "https://mariaborg.dev" })];
  const result = await answerQuestion("Website", library);
  assert.equal(result.answer, "https://mariaborg.dev");
  assert.equal(result.sourceEntryId, "pf-1");
});

test("answerQuestion: real Betsson label 'What is your desired annual gross salary?' resolves to the verified salary_expectation entry, text preserved verbatim", async () => {
  const library = [entry({ id: "sal-1", question_key: "salary_expectation", question_text: "What are your salary expectations?", answer_text: "€35,000 - €40,000" })];
  const result = await answerQuestion("What is your desired annual gross salary?", library);
  assert.equal(result.answer, "€35,000 - €40,000", "the verified range text must be returned unchanged — never split, rewritten, or converted");
  assert.equal(result.sourceEntryId, "sal-1");
});

test("answerQuestion: real Betsson label 'What is your earliest possible start date?' resolves to the verified start_date entry", async () => {
  const library = [entry({ id: "sd-1", question_key: "start_date", question_text: "What is your earliest possible start date?", answer_text: "1 September 2025" })];
  const result = await answerQuestion("What is your earliest possible start date?", library);
  assert.equal(result.answer, "1 September 2025");
  assert.equal(result.sourceEntryId, "sd-1");
});

test("answerQuestion: additional common start-date phrasings all resolve to the same verified entry", async () => {
  const library = [entry({ id: "sd-1", question_key: "start_date", answer_text: "Immediately" })];
  for (const phrasing of ["When can you start?", "Available to start", "Earliest start date"]) {
    const result = await answerQuestion(phrasing, library);
    assert.equal(result.answer, "Immediately", `expected "${phrasing}" to match`);
    assert.equal(result.sourceEntryId, "sd-1");
  }
});

test("answerQuestion: additional common salary phrasings all resolve to the same verified entry, unchanged", async () => {
  const library = [entry({ id: "sal-1", question_key: "salary_expectation", answer_text: "€40,000" })];
  for (const phrasing of ["Annual salary", "Gross salary", "Compensation expectation", "Expected salary", "Desired salary", "Salary expectation"]) {
    const result = await answerQuestion(phrasing, library);
    assert.equal(result.answer, "€40,000", `expected "${phrasing}" to match`);
    assert.equal(result.sourceEntryId, "sal-1");
  }
});

test("answerQuestion: a missing verified start_date entry still forces manual_required — no fallback to notice_period", async () => {
  // A verified notice_period entry exists, but must never be used to
  // answer a start-date question — a specific calendar date is never
  // computed from a general notice-period policy statement.
  const library = [entry({ id: "np-1", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "1 month" })];
  const result = await answerQuestion("What is your earliest possible start date?", library);
  assert.equal(result.answer, null);
  assert.equal(result.manualRequired, true);
  assert.equal(result.reason, "unmatched");
});

test("answerQuestion: a missing verified salary_expectation entry still forces manual_required for any broadened phrasing", async () => {
  for (const phrasing of ["What is your desired annual gross salary?", "Annual salary", "Compensation expectation"]) {
    const result = await answerQuestion(phrasing, []);
    assert.equal(result.answer, null);
    assert.equal(result.manualRequired, true);
  }
});

test("answerQuestion: a missing verified linkedin_url/portfolio_url entry still forces manual_required for the real Betsson labels", async () => {
  const resultLinkedIn = await answerQuestion("LinkedIn Profile", []);
  assert.equal(resultLinkedIn.manualRequired, true);
  const resultWebsite = await answerQuestion("Website", []);
  assert.equal(resultWebsite.manualRequired, true);
});
