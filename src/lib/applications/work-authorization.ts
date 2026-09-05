import type { WorkAuthorization } from "@/lib/types/database";

export const WORK_AUTHORIZATION_OPTIONS: { value: WorkAuthorization; label: string }[] = [
  { value: "eu_eea_swiss_citizen", label: "I'm an EU / EEA / Swiss citizen" },
  { value: "malta_permit_holder", label: "I already have a valid Malta work permit or visa" },
  { value: "requires_sponsorship", label: "I'd need visa or work permit sponsorship" },
  { value: "prefer_not_to_say", label: "Prefer not to say — I'll answer when applying" },
];

/**
 * Plain-English answer text for the "work_authorization" answer_library
 * entry (see src/lib/ai/answer-questions.ts's COMMON_QUESTION_KEYS, which
 * already recognizes that key). Returns null for "prefer_not_to_say" and
 * for no answer at all — that's a deliberate refusal to fabricate: a
 * user who hasn't engaged with this question, or who explicitly chose not
 * to share, must never have a canned answer submitted on their behalf to
 * a real employer's work-authorization screening question. Any future
 * application-processing code must treat a missing entry as
 * manualRequired, not silently skip the question.
 */
export function workAuthorizationAnswerText(value: WorkAuthorization | null): string | null {
  switch (value) {
    case "eu_eea_swiss_citizen":
      return "I am an EU/EEA/Swiss citizen and do not require a visa or work permit to work in Malta.";
    case "malta_permit_holder":
      return "I already hold a valid work permit/visa for Malta.";
    case "requires_sponsorship":
      return "I would require visa or work permit sponsorship to work in Malta.";
    case "prefer_not_to_say":
    case null:
    default:
      return null;
  }
}
