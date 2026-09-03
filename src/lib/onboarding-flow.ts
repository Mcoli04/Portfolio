import type { WorkType } from "@/lib/types/database";

/**
 * Deterministic map of the entire onboarding flow, used to compute where
 * the Back button on any given screen should go. Deliberately NOT based on
 * browser history — history can skip stages (e.g. a redirect straight to
 * the user's current onboarding_step) or replay stale query strings, so
 * every page instead asks this module "what is the immediately previous
 * stage" and navigates there explicitly.
 *
 * Two of the pages below (Goals, Preferences) each contain several
 * questions behind a single route, driven by local client-side state. Going
 * back into one of those pages from the page after it must land on its
 * LAST question, not its first — that's carried via a `?step=` query param
 * the page reads on mount to pick its initial sub-step.
 */

export type OnboardingPageId = "cv" | "review" | "goals" | "preferences" | "salary" | "autoApply" | "consent";

const PAGE_ORDER: OnboardingPageId[] = ["cv", "review", "goals", "preferences", "salary", "autoApply", "consent"];

const PAGE_ROUTES: Record<OnboardingPageId, string> = {
  cv: "/onboarding/cv",
  review: "/onboarding/review",
  goals: "/onboarding/goals",
  preferences: "/onboarding/preferences",
  salary: "/onboarding/salary",
  autoApply: "/onboarding/auto-apply",
  consent: "/onboarding/consent",
};

export type GoalsStepKey = "workSituation" | "moveTimeline" | "careerGoals";
export const GOALS_STEPS: GoalsStepKey[] = ["workSituation", "moveTimeline", "careerGoals"];

export type PreferencesStepKey =
  | "jobTitle"
  | "locations"
  | "workType"
  | "remoteScope"
  | "employmentType"
  | "experienceLevel";

/**
 * Ordered questions for the Preferences page. "remoteScope" only appears
 * when the user picked Remote as their work type — every other question is
 * fixed. Note the list always ends in the same two questions regardless of
 * that conditional, so a page linking forward into Preferences from behind
 * (Salary's Back button) never needs to know the user's work type to land
 * on the right final question.
 */
export function getPreferencesSteps(workType: WorkType | "any" | null): PreferencesStepKey[] {
  const steps: PreferencesStepKey[] = ["jobTitle", "locations", "workType"];
  if (workType === "remote") steps.push("remoteScope");
  steps.push("employmentType", "experienceLevel");
  return steps;
}

/**
 * The route+query for going back one stage from `page`, landing on the
 * previous stage's last question when that stage has more than one. Returns
 * null when `page` is the very first stage in the whole flow (CV upload) —
 * callers should render no Back button in that case.
 */
export function getPreviousPageHref(page: OnboardingPageId): string | null {
  const idx = PAGE_ORDER.indexOf(page);
  if (idx <= 0) return null;
  const prevPage = PAGE_ORDER[idx - 1];
  const route = PAGE_ROUTES[prevPage];
  if (prevPage === "goals") {
    return `${route}?step=${GOALS_STEPS[GOALS_STEPS.length - 1]}`;
  }
  if (prevPage === "preferences") {
    const steps = getPreferencesSteps(null);
    return `${route}?step=${steps[steps.length - 1]}`;
  }
  return route;
}
