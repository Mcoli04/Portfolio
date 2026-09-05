import type { WorkAuthorization } from "@/lib/types/database";
import type { QuestionAnswer } from "@/lib/ai/answer-questions";
import type { FormField } from "./types";

export type FieldAnswerOutcome = { ok: true; value: string; sourceEntryId: string } | { ok: false; reason: string };

/**
 * The two opposite ways a real employer phrases a work-authorization
 * boolean/select question. The existing COMMON_QUESTION_KEYS.work_authorization
 * regex in answer-questions.ts intentionally matches BOTH — that's fine for
 * free-text prose answers (the canned sentence reads correctly either way),
 * but unsafe for boolean coercion: the same underlying fact
 * (profile.work_authorization) maps to OPPOSITE true/false values depending
 * on which way the question is framed. Conflating them would silently
 * answer roughly half of real phrasings backwards.
 */
type WorkAuthorizationPolarity = "authorized_without_sponsorship" | "requires_sponsorship";

/**
 * A small, hand-reviewed set of canonical phrasings, each pre-classified
 * for polarity. Deliberately narrower than COMMON_QUESTION_KEYS's broad
 * regexes (which also route many of these phrasings to a DIFFERENT key,
 * e.g. "sponsorship" alone matches "sponsorship_requirement", not
 * "work_authorization") — this classifier is independent of that key
 * matching on purpose. A question that doesn't confidently match one of
 * these patterns must fall through to manual_required.
 */
const WORK_AUTHORIZATION_BOOLEAN_PATTERNS: { pattern: RegExp; polarity: WorkAuthorizationPolarity }[] = [
  // "Are you authorized/eligible to work ... without sponsorship/a visa?" / "Do you have the right to work ...?"
  { pattern: /are you (legally )?(authorized|authorised|eligible) to work.*(without (a )?(visa|sponsorship|work permit)|no sponsorship)/i, polarity: "authorized_without_sponsorship" },
  { pattern: /do you have the (legal )?right to work/i, polarity: "authorized_without_sponsorship" },
  { pattern: /are you (currently )?(authorized|authorised) to work in (this|the) (location|country|region)/i, polarity: "authorized_without_sponsorship" },
  // "Will you now or in the future require sponsorship...?" / "Do you require/need a visa or work permit sponsorship?"
  { pattern: /will you (now or in the future )?require (a )?(visa |work permit )?sponsorship/i, polarity: "requires_sponsorship" },
  { pattern: /do you (require|need) (a )?(visa |work permit )?sponsorship/i, polarity: "requires_sponsorship" },
  { pattern: /will you require a visa/i, polarity: "requires_sponsorship" },
];

function classifyWorkAuthorizationPolarity(questionText: string): WorkAuthorizationPolarity | null {
  for (const { pattern, polarity } of WORK_AUTHORIZATION_BOOLEAN_PATTERNS) {
    if (pattern.test(questionText)) return polarity;
  }
  return null;
}

/**
 * Resolves the true/false fact for a work-authorization boolean question
 * from the structured profile.work_authorization enum ONLY — never by
 * parsing Answer Library prose, never inferred from a CV or AI-generated
 * text. Returns null (must become manual_required) when either the
 * question's polarity can't be confidently classified, or the user hasn't
 * given a substantive answer (prefer_not_to_say or unset).
 */
export function resolveWorkAuthorizationBoolean(questionText: string, workAuthorization: WorkAuthorization | null): boolean | null {
  if (!workAuthorization || workAuthorization === "prefer_not_to_say") return null;

  const polarity = classifyWorkAuthorizationPolarity(questionText);
  if (!polarity) return null;

  if (polarity === "authorized_without_sponsorship") {
    return workAuthorization === "eu_eea_swiss_citizen" || workAuthorization === "malta_permit_holder";
  }
  return workAuthorization === "requires_sponsorship";
}

/**
 * The only place a resolved Answer Library match becomes the literal value
 * handed to a provider. Validates the match against the specific field's
 * declared shape (type, options, boolean true/false representation) —
 * never fabricating a representation the provider hasn't declared, and
 * never coercing free text into a boolean.
 *
 * `workAuthorizationEntryId` is looked up directly by question_key (not
 * via answerQuestion()'s per-field regex classification of `field.label`)
 * so a boolean question phrased as a sponsorship question — which
 * COMMON_QUESTION_KEYS routes to the separate "sponsorship_requirement"
 * key — still finds the user's verified work_authorization entry as its
 * audit-trail source, rather than being incorrectly rejected because this
 * specific field's wording didn't happen to match the "work_authorization"
 * key's own regex.
 */
export function normalizeAnswerForField(
  field: FormField,
  resolved: QuestionAnswer,
  context: { workAuthorization: WorkAuthorization | null; workAuthorizationEntryId: string | null }
): FieldAnswerOutcome {
  // A hard-blocked question (legal/compliance/EEO) must never be answered
  // regardless of field shape — checked first, uniformly for every type,
  // so this reason is never silently replaced by a less specific one.
  if (resolved.reason === "hard_blocked") {
    return { ok: false, reason: "hard_blocked" };
  }

  if (field.type === "boolean") {
    if (field.trueValue === undefined || field.falseValue === undefined) {
      return { ok: false, reason: "boolean_representation_undeclared" };
    }
    if (!context.workAuthorizationEntryId) {
      // No verified work_authorization entry on file at all — a boolean
      // question can only ever be answered from that structured, opted-in
      // source, never from any other (free-text) library entry.
      return { ok: false, reason: "no_verified_work_authorization_entry" };
    }
    if (!context.workAuthorization || context.workAuthorization === "prefer_not_to_say") {
      return { ok: false, reason: "work_authorization_not_provided" };
    }
    const fact = resolveWorkAuthorizationBoolean(field.label, context.workAuthorization);
    if (fact === null) return { ok: false, reason: "unrecognized_work_authorization_phrasing" };
    return { ok: true, value: fact ? field.trueValue : field.falseValue, sourceEntryId: context.workAuthorizationEntryId };
  }

  if (resolved.answer === null || !resolved.sourceEntryId) {
    return { ok: false, reason: resolved.reason ?? "unmatched" };
  }

  if (field.type === "text" || field.type === "textarea") {
    return { ok: true, value: resolved.answer, sourceEntryId: resolved.sourceEntryId };
  }

  if (field.type === "select") {
    if (!field.options || field.options.length === 0) {
      return { ok: false, reason: "no_declared_options" };
    }
    const normalized = resolved.answer.trim().toLowerCase();
    const match = field.options.find((option) => option.trim().toLowerCase() === normalized);
    if (!match) return { ok: false, reason: "no_matching_option" };
    return { ok: true, value: match, sourceEntryId: resolved.sourceEntryId };
  }

  return { ok: false, reason: "unsupported_field_type" };
}
