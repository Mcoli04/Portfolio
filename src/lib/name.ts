/**
 * Best-effort split of a single full-name string into first/last name —
 * used ONLY to pre-fill the two separate name fields in onboarding/Profile
 * settings as a starting suggestion the user can correct. Never used at
 * application-submission time: once the user has confirmed first_name/
 * last_name on their profile, those are the only source used for a real
 * application — this heuristic is a one-time UI convenience, not a
 * permanent substitute for asking.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Inverse of splitFullName — used to keep profiles.full_name in sync whenever first/last name is saved. */
export function joinFullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}
