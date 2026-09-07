import { test } from "node:test";
import assert from "node:assert/strict";
import { workAuthorizationAnswerText, WORK_AUTHORIZATION_OPTIONS } from "./work-authorization";

test("never fabricates an answer for 'prefer not to say' or no answer at all", () => {
  // This is the core safety property: a user who hasn't engaged with the
  // question, or who explicitly declined to share, must never end up with
  // a canned answer silently available to answer a real employer's
  // work-authorization screening question on their behalf.
  assert.equal(workAuthorizationAnswerText("prefer_not_to_say"), null);
  assert.equal(workAuthorizationAnswerText(null), null);
});

test("returns real answer text for every substantive answer, never empty", () => {
  const substantive = WORK_AUTHORIZATION_OPTIONS.map((o) => o.value).filter((v) => v !== "prefer_not_to_say");
  for (const value of substantive) {
    const text = workAuthorizationAnswerText(value);
    assert.ok(typeof text === "string" && text.length > 0, `expected real answer text for ${value}`);
  }
});

test("WORK_AUTHORIZATION_OPTIONS includes an explicit opt-out option", () => {
  assert.ok(WORK_AUTHORIZATION_OPTIONS.some((o) => o.value === "prefer_not_to_say"));
});
