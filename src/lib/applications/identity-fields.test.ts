import { test } from "node:test";
import assert from "node:assert/strict";
import { isIdentityRole, isDocumentRole, resolveIdentityFieldValue, hasDocumentData } from "./identity-fields";
import type { Profile } from "@/lib/types/database";
import type { FormFieldRole } from "./types";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    email: "candidate@example.com",
    full_name: "Maria Borg",
    first_name: null,
    last_name: null,
    phone: null,
    ...overrides,
  } as unknown as Profile;
}

test("isIdentityRole: classifies exactly the identity roles", () => {
  const identity: FormFieldRole[] = ["full_name", "first_name", "last_name", "email", "phone"];
  const nonIdentity: (FormFieldRole | undefined)[] = ["resume", "cover_letter", "screening_question", undefined];
  for (const role of identity) assert.equal(isIdentityRole(role), true, role);
  for (const role of nonIdentity) assert.equal(isIdentityRole(role), false, String(role));
});

test("isDocumentRole: classifies exactly the document roles", () => {
  const document: FormFieldRole[] = ["resume", "cover_letter"];
  const nonDocument: (FormFieldRole | undefined)[] = ["full_name", "first_name", "last_name", "email", "phone", "screening_question", undefined];
  for (const role of document) assert.equal(isDocumentRole(role), true, role);
  for (const role of nonDocument) assert.equal(isDocumentRole(role), false, String(role));
});

test("resolveIdentityFieldValue: full_name/email resolve from the profile directly", () => {
  const profile = makeProfile({ full_name: "Maria Borg", email: "maria@example.com" });
  assert.equal(resolveIdentityFieldValue("full_name", profile), "Maria Borg");
  assert.equal(resolveIdentityFieldValue("email", profile), "maria@example.com");
});

test("resolveIdentityFieldValue: phone resolves when present, null when absent", () => {
  assert.equal(resolveIdentityFieldValue("phone", makeProfile({ phone: "+356 7900 0000" })), "+356 7900 0000");
  assert.equal(resolveIdentityFieldValue("phone", makeProfile({ phone: null })), null);
});

test("resolveIdentityFieldValue: first_name/last_name come only from their own structured columns", () => {
  const profile = makeProfile({ full_name: "Maria Borg", first_name: "Maria", last_name: "Borg" });
  assert.equal(resolveIdentityFieldValue("first_name", profile), "Maria");
  assert.equal(resolveIdentityFieldValue("last_name", profile), "Borg");
});

test("resolveIdentityFieldValue: first_name/last_name are NEVER derived or split from full_name when unset", () => {
  // full_name is populated, but first_name/last_name have never been
  // explicitly collected — must resolve to null, never a heuristic split
  // of full_name (see migration 0007's documented intent).
  const profile = makeProfile({ full_name: "Maria Anne Borg", first_name: null, last_name: null });
  assert.equal(resolveIdentityFieldValue("first_name", profile), null);
  assert.equal(resolveIdentityFieldValue("last_name", profile), null);
});

test("resolveIdentityFieldValue: whitespace-only structured values are treated as absent", () => {
  assert.equal(resolveIdentityFieldValue("phone", makeProfile({ phone: "   " })), null);
});

test("hasDocumentData: resume/cover letter present vs empty", () => {
  assert.equal(hasDocumentData("resume", { resumeText: "John Doe CV...", coverLetterText: "" }), true);
  assert.equal(hasDocumentData("resume", { resumeText: "", coverLetterText: "cover text" }), false);
  assert.equal(hasDocumentData("cover_letter", { resumeText: "", coverLetterText: "Dear Hiring Team..." }), true);
  assert.equal(hasDocumentData("cover_letter", { resumeText: "resume", coverLetterText: "   " }), false);
});
