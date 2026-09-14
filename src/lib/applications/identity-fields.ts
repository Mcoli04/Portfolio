import type { Profile } from "@/lib/types/database";
import type { FormFieldRole } from "./types";

export type IdentityFieldRole = "full_name" | "first_name" | "last_name" | "email" | "phone";
export type DocumentFieldRole = "resume" | "cover_letter";

const IDENTITY_ROLES: readonly IdentityFieldRole[] = ["full_name", "first_name", "last_name", "email", "phone"];
const DOCUMENT_ROLES: readonly DocumentFieldRole[] = ["resume", "cover_letter"];

export function isIdentityRole(role: FormFieldRole | undefined): role is IdentityFieldRole {
  return role !== undefined && (IDENTITY_ROLES as readonly string[]).includes(role);
}

export function isDocumentRole(role: FormFieldRole | undefined): role is DocumentFieldRole {
  return role !== undefined && (DOCUMENT_ROLES as readonly string[]).includes(role);
}

/**
 * Resolves a structured identity value directly from the profile — never
 * via answerQuestion()/the Answer Library, and first_name/last_name are
 * NEVER split or inferred from full_name (profile.first_name/last_name
 * exist specifically so a real submission never has to guess a split;
 * see migration 0007). Returns null when the structured field itself is
 * empty/unset, which callers must treat as "no safe answer" — manual_required
 * if the field is required, silently omitted if optional — never fabricated.
 */
export function resolveIdentityFieldValue(role: IdentityFieldRole, profile: Profile): string | null {
  switch (role) {
    case "full_name":
      return profile.full_name?.trim() || null;
    case "first_name":
      return profile.first_name?.trim() || null;
    case "last_name":
      return profile.last_name?.trim() || null;
    case "email":
      return profile.email?.trim() || null;
    case "phone":
      return profile.phone?.trim() || null;
  }
}

/**
 * Whether real document data for this role is currently established.
 * `coverLetterText` is `string | null` because a cover letter is always
 * freshly authored per application (there is no pre-existing "cover
 * letter" record the way there is a resume) — it only genuinely exists
 * once generation has actually run. Callers that haven't run generation
 * yet (e.g. read-only form inspection, before a submission attempt is
 * even possible) must pass `null` rather than inventing placeholder
 * text, which correctly makes any required cover_letter-role field
 * unresolved instead of falsely satisfied. Once real generation has run
 * (with a safe non-AI template fallback when no OpenAI key is
 * available), callers pass the real text and this becomes mostly a
 * defensive check — but a field requiring a document this run genuinely
 * has none for must still stop the application rather than submit an
 * empty one.
 */
export function hasDocumentData(role: DocumentFieldRole, documents: { resumeText: string; coverLetterText: string | null }): boolean {
  if (role === "resume") return documents.resumeText.trim().length > 0;
  return documents.coverLetterText !== null && documents.coverLetterText.trim().length > 0;
}
