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
