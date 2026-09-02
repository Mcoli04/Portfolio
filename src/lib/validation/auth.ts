import { z } from "zod";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Single source of truth for password strength rules — shared by the zod
 * schema (real validation) and the signup page's live checklist UI, so the
 * two can never drift out of sync.
 */
export const PASSWORD_REQUIREMENTS: { id: string; label: string; test: (password: string) => boolean }[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "uppercase",
    label: "At least 1 uppercase letter (A–Z)",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "At least 1 number (0–9)",
    test: (password) => /[0-9]/.test(password),
  },
];

function unmetPasswordRequirements(password: string): string[] {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password)).map((requirement) => requirement.label);
}

export const signupSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().superRefine((password, ctx) => {
      const missing = unmetPasswordRequirements(password);
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Password must include: ${missing.join(", ")}`,
        });
      }
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
