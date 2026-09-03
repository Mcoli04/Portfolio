import { test } from "node:test";
import assert from "node:assert/strict";
import { documentStatusLabel, isDocumentConfirmedSubmitted } from "./document-status";

test("never claims a document was submitted unless status is confirmed 'submitted'", () => {
  const unconfirmedStatuses = ["interested", "queued", "applying", "failed", "manual_required"] as const;
  for (const status of unconfirmedStatuses) {
    assert.equal(documentStatusLabel("resume", status), "Tailored CV prepared");
    assert.equal(documentStatusLabel("cover_letter", status), "Cover letter prepared");
    assert.equal(isDocumentConfirmedSubmitted(status), false);
  }
});

test("labels as submitted only once the application is genuinely confirmed submitted", () => {
  assert.equal(documentStatusLabel("resume", "submitted"), "Tailored CV submitted");
  assert.equal(documentStatusLabel("cover_letter", "submitted"), "Cover letter submitted");
  assert.equal(isDocumentConfirmedSubmitted("submitted"), true);
});

test("a Greenhouse job resolved to manual_required (browser automation unavailable/not allowlisted) never shows 'submitted' labels", () => {
  // Mirrors the exact failure mode reported: engine.run() resolves a real
  // Greenhouse job to manual_required, but submitted_resume_id/
  // cover_letter_id may still be set from document generation that ran
  // before the provider call — the label must reflect the true status,
  // not just whether an id is present.
  const status = "manual_required";
  assert.equal(documentStatusLabel("resume", status), "Tailored CV prepared");
  assert.equal(documentStatusLabel("cover_letter", status), "Cover letter prepared");
});
