import type { Job, JobPreferences, Profile } from "@/lib/types/database";
import { isAllMaltaLocations } from "@/lib/malta-locations";
import { getOpenAIClient, CHAT_MODEL } from "./openai-client";

export interface MatchResult {
  score: number;
  reasons: string[];
  matchedSkills: string[];
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function overlap(a: string[], b: string[]): string[] {
  const setB = new Set(b.map(normalize));
  return a.filter((item) => setB.has(normalize(item)));
}

/**
 * Deterministic scoring engine (spec §13). Runs entirely locally — no AI
 * call required — so it can score an entire feed cheaply and consistently.
 * AI is used only to phrase the human-readable explanation, never to alter
 * the numeric score.
 */
export function computeMatchScore(profile: Profile, preferences: JobPreferences | null, job: Job): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  // Skills overlap — 35 pts
  const matchedSkills = overlap(job.skills ?? [], profile.skills ?? []);
  const skillDenominator = Math.max(job.skills?.length ?? 0, 1);
  const skillFraction = Math.min(matchedSkills.length / skillDenominator, 1);
  score += skillFraction * 35;
  if (matchedSkills.length > 0) {
    reasons.push(`You have ${matchedSkills.length} matching skill${matchedSkills.length === 1 ? "" : "s"}: ${matchedSkills.slice(0, 4).join(", ")}`);
  }

  // Title similarity — 20 pts
  const candidateTitles = [...(profile.job_titles ?? []), ...(preferences?.job_titles ?? []), ...(preferences?.custom_titles ?? [])];
  const titleWords = new Set(normalize(job.title).split(/\s+/).filter((w) => w.length > 2));
  let bestTitleOverlap = 0;
  for (const title of candidateTitles) {
    const words = normalize(title).split(/\s+/).filter((w) => w.length > 2);
    const hit = words.filter((w) => titleWords.has(w)).length;
    if (words.length > 0) bestTitleOverlap = Math.max(bestTitleOverlap, hit / words.length);
  }
  score += bestTitleOverlap * 20;
  if (bestTitleOverlap > 0.5) reasons.push(`The role title closely matches your target job titles`);

  // Location — 15 pts
  // An empty locations array means the user has no location selection at
  // all (distinct from explicitly choosing "any"/All Malta) and is treated
  // as no locality match, not as unrestricted — see src/lib/malta-locations.ts.
  const locations = preferences?.locations ?? [];
  const locationIsAny = isAllMaltaLocations(locations);
  const localityMatch = job.locality && locations.some((l) => normalize(l) === normalize(job.locality!));
  if (locationIsAny || localityMatch) {
    score += 15;
    if (localityMatch) reasons.push(`Located in ${job.locality}, one of your preferred areas`);
  } else if (job.remote_type === "remote") {
    score += 10;
  }

  // Work type — 10 pts
  const workTypes: string[] = preferences?.work_types ?? [];
  if (workTypes.length === 0 || workTypes.includes("any") || (job.remote_type && workTypes.includes(job.remote_type))) {
    score += 10;
    if (job.remote_type) reasons.push(`Supports ${job.remote_type} work, matching your preference`);
  }

  // Employment type — 5 pts
  const employmentTypes = preferences?.employment_types ?? [];
  if (employmentTypes.length === 0 || (job.employment_type && employmentTypes.includes(job.employment_type))) {
    score += 5;
  }

  // Experience level — 10 pts
  const experienceLevels = preferences?.experience_levels ?? [];
  if (experienceLevels.length === 0 || (job.experience_level && experienceLevels.includes(job.experience_level))) {
    score += 10;
  }

  // Salary — 5 pts
  if (preferences?.salary_min != null && job.salary_max != null) {
    if (job.salary_max >= preferences.salary_min) score += 5;
  } else {
    score += 2.5;
  }

  // Keyword include/exclude adjustments
  const descriptionLower = normalize(`${job.title} ${job.description} ${job.requirements ?? ""}`);
  for (const keyword of preferences?.keywords_exclude ?? []) {
    if (keyword && descriptionLower.includes(normalize(keyword))) {
      score -= 25;
      reasons.push(`Contains excluded keyword "${keyword}" — score reduced`);
    }
  }
  for (const keyword of preferences?.keywords_include ?? []) {
    if (keyword && descriptionLower.includes(normalize(keyword))) {
      score += 5;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (reasons.length === 0) {
    reasons.push("General match based on your profile and preferences");
  }

  return { score, reasons, matchedSkills };
}

/**
 * Produces the friendly "Why this matches you" sentence shown on the job
 * card. Uses AI for natural phrasing when configured; otherwise composes a
 * template sentence from the same signals the deterministic score used —
 * never fabricating anything beyond what computeMatchScore already found.
 */
export async function explainMatch(profile: Profile, job: Job, match: MatchResult): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    return templateExplanation(job, match);
  }

  try {
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.4,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "You write a single short, honest sentence explaining why a job matches a candidate, based only on the facts given. Never invent skills, experience, or qualifications not listed.",
        },
        {
          role: "user",
          content: `Candidate skills: ${profile.skills.join(", ") || "none listed"}.\nMatched skills for this job: ${match.matchedSkills.join(", ") || "none"}.\nJob title: ${job.title}.\nWork type: ${job.remote_type ?? "unspecified"}.\nLocation: ${job.locality ?? job.location ?? "Malta"}.\nMatch score: ${match.score}%.\n\nWrite one sentence starting with "Strong match because" or "Good match because" or "Partial match because" depending on the score.`,
        },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || templateExplanation(job, match);
  } catch (error) {
    console.error("[matching] AI explanation failed, using template", error);
    return templateExplanation(job, match);
  }
}

function templateExplanation(job: Job, match: MatchResult): string {
  const qualifier = match.score >= 85 ? "Strong match" : match.score >= 65 ? "Good match" : "Partial match";
  const skillsPart = match.matchedSkills.length > 0
    ? `you have experience with ${match.matchedSkills.slice(0, 3).join(", ")}`
    : "your profile overlaps with parts of this role";
  const locationPart = job.remote_type
    ? `this role supports ${job.remote_type} work in ${job.locality ?? "Malta"}`
    : `this role is based in ${job.locality ?? "Malta"}`;
  return `${qualifier} because ${skillsPart} and ${locationPart}.`;
}
