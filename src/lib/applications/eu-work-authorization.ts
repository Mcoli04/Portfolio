import type { WorkAuthorization } from "@/lib/types/database";
import type { FormField } from "./types";

/**
 * The ONE confirmed real-world wording this rule answers (live Greenhouse
 * "European Union" question, verified against application_pending_questions
 * across 4 real occurrences) — a deliberately exact, whitespace/punctuation
 * -tolerant match, never a broad "legal right to work" regex. A Malta-scoped
 * question ("Are you authorized to work in Malta?", the question
 * profile.work_authorization was actually collected against — see
 * src/app/onboarding/goals/page.tsx) and this EU-wide one ask genuinely
 * different things: the same profile.work_authorization value can safely
 * answer one and not the other (see resolveEuWorkAuthorizationAnswer
 * below). This detector must therefore never also match a Malta-scoped
 * phrasing, or any other "legal right to work" variant, and is kept in its
 * own module — entirely separate from answer-normalization.ts's
 * Malta-scoped WORK_AUTHORIZATION_BOOLEAN_PATTERNS — so broadening it is a
 * deliberate future decision, never a byproduct of refactoring the two
 * together.
 */
const EU_WIDE_WORK_AUTHORIZATION_QUESTION = /^do you currently have the legal right to work in the european union\??$/i;

export function isEuWideWorkAuthorizationQuestion(questionText: string): boolean {
  return EU_WIDE_WORK_AUTHORIZATION_QUESTION.test(questionText.trim());
}

export type EuWorkAuthorizationOutcome = { ok: true; value: string; sourceEntryId: string } | { ok: false; reason: string };

/**
 * Resolves this EXACT EU-wide question from profile.work_authorization —
 * structurally separate from, and deliberately narrower than, the
 * Malta-scoped "authorized_without_sponsorship" polarity in
 * answer-normalization.ts (which also treats malta_permit_holder as
 * authorized — correct for a Malta-scoped question, wrong here: a
 * Malta-issued national work permit does not confer a general EU-wide
 * right to work). Only eu_eea_swiss_citizen — a citizenship/EEA-treaty
 * status that is true independent of which question prompted its
 * collection — can safely answer "Yes" here. Every other value
 * (malta_permit_holder, requires_sponsorship, prefer_not_to_say, unset)
 * stays unresolved: none of them establish an EU-wide fact one way or the
 * other, and guessing "No" for any of them would itself be an unproven
 * assumption about the candidate's immigration status, not something the
 * stored data actually shows.
 *
 * Requires the field to declare a clean two-option Yes/No shape (exactly
 * one option labeled "Yes" and one labeled "No", case-insensitively,
 * nothing else) — an ambiguous, incomplete, or unrecognized options
 * declaration always stays unresolved, checked before anything else,
 * since there would be no safe provider value to return regardless of
 * profile.work_authorization.
 */
export function resolveEuWorkAuthorizationAnswer(
  field: FormField,
  context: { workAuthorization: WorkAuthorization | null; workAuthorizationEntryId: string | null }
): EuWorkAuthorizationOutcome {
  const options = field.options ?? [];
  const yesOption = options.find((o) => o.label.trim().toLowerCase() === "yes");
  const noOption = options.find((o) => o.label.trim().toLowerCase() === "no");
  if (options.length !== 2 || !yesOption || !noOption) {
    return { ok: false, reason: "eu_work_authorization_options_not_recognized" };
  }

  if (!context.workAuthorizationEntryId) {
    // No verified work_authorization entry on file at all — this question
    // can only ever be answered from that structured, opted-in source,
    // never from any other (free-text) library entry.
    return { ok: false, reason: "no_verified_work_authorization_entry" };
  }

  if (!context.workAuthorization || context.workAuthorization === "prefer_not_to_say") {
    return { ok: false, reason: "work_authorization_not_provided" };
  }

  if (context.workAuthorization !== "eu_eea_swiss_citizen") {
    // malta_permit_holder / requires_sponsorship: real information exists
    // on file, but neither establishes (nor refutes) an EU-wide right to
    // work — see the doc comment above. Never guess "No" here.
    return { ok: false, reason: "not_established_eu_wide" };
  }

  // The provider's own declared value for its "Yes" option — never a
  // hardcoded "1"/"true", and never assumed to be in any particular
  // position among the declared options.
  return { ok: true, value: yesOption.value, sourceEntryId: context.workAuthorizationEntryId };
}
