import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMatchScore } from "@/lib/ai/matching";
import type { Job, JobPreferences, JobWithMatch, Profile } from "@/lib/types/database";

const FETCH_POOL_SIZE = 60;

/**
 * Discover feed query (spec §27): active, not expired, and not already
 * applied/rejected/dismissed/completed by this user. Results are scored and
 * ranked by match quality, location, skills, salary and recency.
 */
export async function getDiscoverFeed(
  supabase: SupabaseClient,
  userId: string,
  limit = 15
): Promise<{ jobs: JobWithMatch[]; profile: Profile; preferences: JobPreferences | null }> {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) throw new Error("Profile not found");

  const { data: preferences } = await supabase
    .from("job_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<JobPreferences>();

  const [{ data: interactions }, { data: applications }] = await Promise.all([
    supabase.from("job_interactions").select("job_id").eq("user_id", userId).in("action", ["rejected", "dismissed"]),
    supabase.from("applications").select("job_id").eq("user_id", userId),
  ]);

  const excludedIds = new Set<string>([
    ...(interactions ?? []).map((i: { job_id: string }) => i.job_id),
    ...(applications ?? []).map((a: { job_id: string }) => a.job_id),
  ]);

  let query = supabase
    .from("jobs")
    .select("*")
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("posted_at", { ascending: false })
    .limit(FETCH_POOL_SIZE);

  const { data: candidateJobs } = await query;
  const pool: Job[] = (candidateJobs ?? []).filter((job: Job) => !excludedIds.has(job.id));

  const scored: JobWithMatch[] = pool.map((job) => {
    const match = computeMatchScore(profile, preferences ?? null, job);
    return { ...job, match_score: match.score, match_reasons: match.reasons };
  });

  scored.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
  });

  return { jobs: scored.slice(0, limit), profile, preferences: preferences ?? null };
}
