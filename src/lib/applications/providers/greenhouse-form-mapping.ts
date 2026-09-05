import type { ApplicationForm, FormField, FormFieldOption, FormFieldRole } from "../types";

/**
 * Shapes returned by Greenhouse's public, unauthenticated Job Board API
 * when fetched with `?questions=true` (developers.greenhouse.io/job-board.html).
 * Field `type` values are Greenhouse's own documented set — anything not
 * in this list is still accepted at the type level (widened to `string`)
 * so a future/unrecognized value never fails to parse, but the mapper
 * below only recognizes the six documented values and fails safe on
 * everything else.
 */
export interface GreenhouseQuestionValue {
  label: string;
  value: number | string;
}

export interface GreenhouseQuestionField {
  name: string;
  type:
    | "input_file"
    | "input_text"
    | "input_hidden"
    | "textarea"
    | "multi_value_single_select"
    | "multi_value_multi_select"
    | string;
  values?: GreenhouseQuestionValue[];
}

export interface GreenhouseQuestion {
  id: number;
  label: string;
  required: boolean;
  fields: GreenhouseQuestionField[];
}

export interface GreenhouseJobDetailResponse {
  id: number;
  questions?: GreenhouseQuestion[];
}

/**
 * Greenhouse's own stable, platform-wide field names for standard
 * identity/document fields — the same across every Greenhouse-hosted
 * posting, never employer-authored text. Mapping by this exact name is
 * what lets us assign a `role` safely, instead of guessing from a label.
 */
const STANDARD_FIELD_ROLES: Record<string, FormFieldRole> = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  resume: "resume",
  cover_letter: "cover_letter",
};

/**
 * Maps one Greenhouse field to a FormField, or null when this field must
 * never become an answerable FormField on its own:
 *   - "resume_text" and "cover_letter_text" (Greenhouse's free-text
 *     alternatives to uploading a resume/cover-letter file) are always
 *     absorbed into the "resume"/"cover_letter" role field emitted for
 *     their sibling "resume"/"cover_letter" field — they must never
 *     surface as their own screening question asking the candidate to
 *     paste their CV or cover letter.
 *   - "input_hidden" fields are never something a candidate is actually
 *     asked to fill in; we have no safe value to put there and never
 *     fabricate one.
 *   - Any field type outside Greenhouse's documented six is unrecognized
 *     and never coerced into the closest-looking type.
 * A required question left with zero mapped fields is handled by the
 * caller (mapGreenhouseQuestionToFormFields), not here.
 */
function mapGreenhouseFieldToFormField(field: GreenhouseQuestionField, question: GreenhouseQuestion): FormField | null {
  if (field.name === "resume_text" || field.name === "cover_letter_text") return null;
  if (field.type === "input_hidden") return null;

  const standardRole = STANDARD_FIELD_ROLES[field.name];
  if (standardRole === "resume" || standardRole === "cover_letter") {
    return { id: field.name, label: question.label, type: "file", required: question.required, role: standardRole };
  }
  if (standardRole) {
    return { id: field.name, label: question.label, type: "text", required: question.required, role: standardRole };
  }

  // Not a standard field — a genuine employer-authored screening question.
  // `role` is left undefined (defaults to "screening_question").
  switch (field.type) {
    case "input_text":
      return { id: field.name, label: question.label, type: "text", required: question.required };
    case "textarea":
      return { id: field.name, label: question.label, type: "textarea", required: question.required };
    case "input_file":
      // A file upload we don't recognize as the standard resume/cover
      // letter (role stays undefined): unsupported — never synthesized.
      return { id: field.name, label: question.label, type: "file", required: question.required };
    case "multi_value_single_select": {
      const options: FormFieldOption[] = (field.values ?? [])
        .filter((v): v is GreenhouseQuestionValue => typeof v.label === "string" && v.label.length > 0)
        .map((v) => ({ label: v.label, value: String(v.value) }));
      // No provider-declared options at all: nothing safe to offer. Falls
      // through to the caller's required/unsupported handling.
      if (options.length === 0) return null;
      return { id: field.name, label: question.label, type: "select", required: question.required, options };
    }
    case "multi_value_multi_select":
      // Unsupported: candidate.answers holds one value per field, and a
      // multi-select can have more than one chosen value. Deliberately
      // never populate `options` here (even though Greenhouse declares
      // them) — an empty-options "select" field routes through
      // normalizeAnswerForField's existing "no declared options" safe
      // fallback (manual_required if required, omitted if optional)
      // rather than us inventing multi-value support.
      return { id: field.name, label: question.label, type: "select", required: question.required };
    default:
      // Unknown/future Greenhouse field type — fail safe, never coerced
      // into the closest-looking type we do understand.
      return null;
  }
}

/**
 * Maps one Greenhouse question (which may declare multiple fields, e.g.
 * the Resume question's paired "resume" + "resume_text" fields) into zero
 * or more FormFields. If every field on a REQUIRED question was skipped
 * or unrecognized, a single unsupported placeholder is emitted so the
 * engine still treats this question as blocking (manual_required) instead
 * of silently vanishing a question the candidate would have had to answer.
 */
export function mapGreenhouseQuestionToFormFields(question: GreenhouseQuestion): FormField[] {
  const fields: FormField[] = [];
  for (const field of question.fields ?? []) {
    const mapped = mapGreenhouseFieldToFormField(field, question);
    if (mapped) fields.push(mapped);
  }

  if (fields.length === 0 && question.required) {
    fields.push({
      id: `gh_question_${question.id}`,
      label: question.label,
      type: "select",
      required: true,
      // No options declared on purpose — this question's shape isn't one
      // we recognize as safely answerable (e.g. a lone input_hidden
      // field, resume_text with no sibling resume field, or a field type
      // we don't understand at all). Routes through
      // normalizeAnswerForField's existing safe fallback to manual_required.
    });
  }

  return fields;
}

/**
 * Maps a full Greenhouse job-detail response (fetched with
 * `?questions=true`, no authentication) into our ApplicationForm shape.
 */
export function mapGreenhouseFormResponse(response: GreenhouseJobDetailResponse): ApplicationForm {
  const fields = (response.questions ?? []).flatMap(mapGreenhouseQuestionToFormFields);
  return {
    fields,
    // This read-only JSON API describes form FIELDS — it says nothing
    // about whether the rendered application page carries a CAPTCHA,
    // bot-protection widget, or login wall. It can neither confirm nor
    // rule out human verification, so this is a conservative default,
    // not a claim the API proved anything. It also changes nothing about
    // submission safety: GreenhouseApplicationProvider.isConfigured()
    // stays false independently, so submitApplication() refuses before
    // submitLive() is ever reached regardless of this value, and browser
    // automation (the only mechanism in this codebase that actually
    // inspects a live rendered page) is not used for Greenhouse at all.
    requiresHumanVerification: false,
  };
}

/**
 * Extracts the Greenhouse board token from a job's public application
 * URL — e.g. "https://job-boards.greenhouse.io/betsson/jobs/123456" or
 * the older "https://boards.greenhouse.io/betsson/jobs/123456" both yield
 * "betsson". Only recognizes genuine greenhouse.io hosts (exact match or
 * a real subdomain — "evilgreenhouse.io" must never match "greenhouse.io"
 * by bare suffix, the same host-matching mistake
 * BrowserAutomationApplicationProvider.isDomainAllowed() already guards
 * against).
 */
export function extractGreenhouseBoardToken(applicationUrl: string | null): string | null {
  if (!applicationUrl) return null;
  let url: URL;
  try {
    url = new URL(applicationUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "greenhouse.io" && !host.endsWith(".greenhouse.io")) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  return segments[0] || null;
}
