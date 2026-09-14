export interface ResumeDefaultCandidate {
  id: string;
  isDefault: boolean;
  updatedAt: string;
}

/**
 * Resolves exactly one resume id to treat as "the" default, even if the
 * underlying data has drifted (zero, one, or more rows with isDefault
 * true). Mirrors the tie-break rule the 0008 migration uses to repair
 * existing duplicate-default rows:
 *   1. the resume profiles.default_resume_id already points at, if it's
 *      one of the currently-default resumes;
 *   2. otherwise, the most recently updated currently-default resume;
 *   3. null if no resume is marked default at all.
 * Read-only — used to give the Profile UI one canonical default signal
 * instead of trusting two fields (resumes.is_default and
 * profiles.default_resume_id) that can otherwise disagree.
 */
export function resolveSingleDefaultId(resumes: ResumeDefaultCandidate[], preferredId: string | null): string | null {
  const defaults = resumes.filter((r) => r.isDefault);
  if (defaults.length === 0) return null;
  const preferred = defaults.find((r) => r.id === preferredId);
  if (preferred) return preferred.id;
  return [...defaults].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0].id;
}

export interface ExistingResumeDefault {
  id: string;
  isDefault: boolean;
}

/**
 * Ids that must be cleared to is_default = false before a newly uploaded
 * resume can safely be inserted as the default. Applying this first is
 * what stops /api/cv/upload from ever leaving two resumes marked default
 * at once — every currently-true row is included, not just the most
 * recent one, so a user who already had duplicate defaults gets cleaned
 * up the next time they upload with setAsDefault too.
 */
export function idsToClearForNewDefault(existing: ExistingResumeDefault[]): string[] {
  return existing.filter((r) => r.isDefault).map((r) => r.id);
}
