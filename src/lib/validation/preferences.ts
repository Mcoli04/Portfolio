import { z } from "zod";

export const SALARY_NEGATIVE_MESSAGE = "Salary cannot be negative.";
export const SALARY_INVALID_MESSAGE = "Enter a valid salary amount.";
export const SALARY_MAX_BELOW_MIN_MESSAGE = "Max salary cannot be lower than min salary.";

/**
 * Single source of truth for salary range validation — shared by the
 * onboarding Preferences step and the Settings/Preferences page so neither
 * can drift into allowing a negative or inverted salary range. Both fields
 * are optional (blank is allowed); when a value is present it must be a
 * non-negative finite number, and when both are present max must not be
 * lower than min.
 */
export const salaryRangeSchema = z
  .object({
    salaryMin: z
      .number({ invalid_type_error: SALARY_INVALID_MESSAGE })
      .refine((value) => Number.isFinite(value), SALARY_INVALID_MESSAGE)
      .refine((value) => value >= 0, SALARY_NEGATIVE_MESSAGE)
      .nullable(),
    salaryMax: z
      .number({ invalid_type_error: SALARY_INVALID_MESSAGE })
      .refine((value) => Number.isFinite(value), SALARY_INVALID_MESSAGE)
      .refine((value) => value >= 0, SALARY_NEGATIVE_MESSAGE)
      .nullable(),
  })
  .refine((data) => data.salaryMin == null || data.salaryMax == null || data.salaryMax >= data.salaryMin, {
    message: SALARY_MAX_BELOW_MIN_MESSAGE,
    path: ["salaryMax"],
  });

export type SalaryRangeInput = z.infer<typeof salaryRangeSchema>;

/** Parses raw min/max salary input strings (as kept in form state) into numbers or null, without ever coercing a negative value to positive. */
export function parseSalaryField(raw: string): number | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/**
 * Validates a salary range from raw form input strings. Returns the first
 * validation error message, or null when the range is valid (including both
 * fields blank).
 */
export function validateSalaryRange(salaryMinRaw: string, salaryMaxRaw: string): string | null {
  const result = salaryRangeSchema.safeParse({
    salaryMin: parseSalaryField(salaryMinRaw),
    salaryMax: parseSalaryField(salaryMaxRaw),
  });
  if (!result.success) {
    return result.error.issues[0]?.message ?? SALARY_INVALID_MESSAGE;
  }
  return null;
}
