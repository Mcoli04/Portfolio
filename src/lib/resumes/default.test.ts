import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSingleDefaultId, idsToClearForNewDefault } from "./default";

test("resolveSingleDefaultId: duplicate defaults resolve to the one profiles.default_resume_id already points at", () => {
  const resumes = [
    { id: "a", isDefault: true, updatedAt: "2024-01-01T00:00:00Z" },
    { id: "b", isDefault: true, updatedAt: "2024-06-01T00:00:00Z" },
  ];
  assert.equal(resolveSingleDefaultId(resumes, "a"), "a");
});

test("resolveSingleDefaultId: duplicate defaults fall back to the most recently updated when the preferred id doesn't match either", () => {
  const resumes = [
    { id: "a", isDefault: true, updatedAt: "2024-01-01T00:00:00Z" },
    { id: "b", isDefault: true, updatedAt: "2024-06-01T00:00:00Z" },
  ];
  assert.equal(resolveSingleDefaultId(resumes, null), "b");
  assert.equal(resolveSingleDefaultId(resumes, "some-other-resume-id"), "b");
});

test("resolveSingleDefaultId: a single default is returned unchanged regardless of the preferred id", () => {
  const resumes = [
    { id: "a", isDefault: false, updatedAt: "2024-01-01T00:00:00Z" },
    { id: "b", isDefault: true, updatedAt: "2024-06-01T00:00:00Z" },
  ];
  assert.equal(resolveSingleDefaultId(resumes, "a"), "b");
});

test("resolveSingleDefaultId: returns null when no resume is marked default", () => {
  const resumes = [{ id: "a", isDefault: false, updatedAt: "2024-01-01T00:00:00Z" }];
  assert.equal(resolveSingleDefaultId(resumes, null), null);
});

test("idsToClearForNewDefault: uploading a new default clears every existing default, including leftover duplicates", () => {
  const existing = [
    { id: "a", isDefault: true },
    { id: "b", isDefault: true },
    { id: "c", isDefault: false },
  ];
  assert.deepEqual(idsToClearForNewDefault(existing).sort(), ["a", "b"]);
});

test("idsToClearForNewDefault: returns nothing to clear when there is no existing default", () => {
  const existing = [{ id: "a", isDefault: false }];
  assert.deepEqual(idsToClearForNewDefault(existing), []);
});
