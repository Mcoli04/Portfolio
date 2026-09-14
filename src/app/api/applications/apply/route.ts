import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApplicationAutomationEngine } from "@/lib/applications/engine";
import { decideSwipeRightAction } from "@/lib/applications/auto-apply-mode";
import { claimApplicationForProcessing } from "@/lib/applications/claim";
import type { Job, Profile, ResumeVersion } from "@/lib/types/database";

export const runtime = "nodejs";

/**
 * Statuses that represent a real, already-happened outcome — force must
 * NEVER bypass these. Unlike "queued"/"manual_required"/"failed" (all
 * genuinely retryable), reprocessing one of these would mean re-running
 * the whole application flow, and for "submitted" specifically, risking a
 * second real submission to the employer for something already confirmed.
 */
const TERMINAL_APPLICATION_STATUSES = ["submitted", "interview", "offer", "rejected", "withdrawn"];

async function getDefaultResumeVersion(supabase: SupabaseClient, profile: Profile): Promise<ResumeVersion | null> {
  if (!profile.default_resume_id) return null;
  const { data: resume } = await supabase
    .from("resumes")
    .select("latest_version_id")
    .eq("id", profile.default_resume_id)
    .single();
  if (!resume?.latest_version_id) return null;
  const { data: version } = await supabase
    .from("resume_versions")
    .select("*")
    .eq("id", resume.latest_version_id)
    .single<ResumeVersion>();
  return version ?? null;
}

/**
 * Core swipe-right logic (spec §22-25, §32), separated from the Next.js
 * request/cookie plumbing so it can be driven directly with a fake
 * SupabaseClient in tests — matching the pattern already used everywhere
 * else business logic in this codebase is tested (engine.run(ctx),
 * ingestJobs(supabase), saveApplicationAnswersAndRequeue(supabase, ...)).
 * POST() below is a thin wrapper: resolve the real client/user, then
 * delegate here. Enforces the duplicate-application unique constraint,
 * respects the user's Auto Apply mode, and only ever runs the automation
 * engine when the user has explicitly authorized Auto Apply.
 */
export async function handleApplyRequest(
  supabase: SupabaseClient,
  userId: string,
  body: { jobId?: string; matchScore?: number; force?: boolean }
): Promise<NextResponse> {
  const { jobId, matchScore, force } = body;
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    // Terminal/success statuses are never re-enterable through this route,
    // force or not — force is only ever a legitimate bypass for a genuinely
    // retryable status (queued/manual_required/applying/failed), never a
    // general "process this again anyway" switch.
    if (TERMINAL_APPLICATION_STATUSES.includes(existing.status)) {
      return NextResponse.json({ error: "You've already applied to this job.", application: existing }, { status: 409 });
    }
    if (existing.status !== "failed" && !force) {
      return NextResponse.json({ error: "You've already applied to this job.", application: existing }, { status: 409 });
    }
  }

  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single<Job>();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.active) {
    return NextResponse.json({ error: "This job is no longer active." }, { status: 410 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await supabase.from("job_interactions").upsert(
    { user_id: userId, job_id: jobId, action: "saved", match_score: matchScore ?? null },
    { onConflict: "user_id,job_id" }
  );

  const action = decideSwipeRightAction(profile.auto_apply_mode, matchScore ?? 0);

  const applicationPayload = {
    user_id: userId,
    job_id: jobId,
    company_id: job.company_id,
    resume_id: profile.default_resume_id,
    match_score: matchScore ?? null,
    application_method: job.application_method,
    // New/retryable rows go to "queued" here — never directly to
    // "applying"; the only way a row transitions to "applying" is the
    // atomic claim step below, immediately before engine.run(). If the
    // existing row is CURRENTLY "applying" (a force=true request racing an
    // already-active run), status is deliberately left untouched here
    // rather than reset to "queued" — resetting it would make the claim
    // step below wrongly re-claimable, letting this request run
    // engine.run() a second time concurrently with whatever is already
    // processing it. Leaving it "applying" means the claim step correctly
    // refuses (not stale, no recovery option passed) and this request
    // safely reports "already being processed" instead.
    ...(existing?.status === "applying" ? {} : { status: "queued" as const }),
  };

  let application;
  if (existing) {
    const { data, error } = await supabase.from("applications").update(applicationPayload).eq("id", existing.id).select().single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not update application" }, { status: 500 });
    }
    application = data;
  } else {
    const { data, error } = await supabase.from("applications").insert(applicationPayload).select().single();
    if (error) {
      // A concurrent duplicate request can win the race on the
      // unique(user_id, job_id) constraint — that's a genuine "you already
      // applied" case, not a server error. Only this specific Postgres
      // error code is treated as a duplicate; any other insert failure
      // still surfaces as a real 500 below.
      if (error.code === "23505") {
        const { data: raced } = await supabase
          .from("applications")
          .select("id, status")
          .eq("user_id", userId)
          .eq("job_id", jobId)
          .maybeSingle();
        return NextResponse.json({ error: "You've already applied to this job.", application: raced }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Could not create application" }, { status: 500 });
    }
    application = data;
  }

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "APPLICATION_CREATED",
    metadata: { matchScore, autoApplyAction: action },
  });

  if (eventError) {
    console.error("[apply] failed to log APPLICATION_CREATED", eventError.message);
  }

  if (action === "add_to_review_queue") {
    return NextResponse.json({ status: "queued", application });
  }

  if (action === "confirm_then_submit" && !force) {
    return NextResponse.json({ status: "confirmation_required", application, matchScore });
  }

  // Atomic claim: the one mechanism preventing this application from ever
  // being processed by two concurrent callers (a duplicate swipe racing
  // this same request, or the standalone worker having already picked up
  // this exact row). engine.run() must never be called without this
  // succeeding first.
  const claimed = await claimApplicationForProcessing(supabase, application.id);
  if (!claimed) {
    return NextResponse.json(
      {
        status: "manual_required",
        outcome: { status: "manual_required", reason: "This application is already being processed." },
        application,
      },
      { status: 409 }
    );
  }

  const resumeVersion = await getDefaultResumeVersion(supabase, profile);

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({
    supabase,
    application: claimed,
    job,
    profile,
    resumeVersion,
  });

  return NextResponse.json({ status: outcome.status, outcome, application: claimed });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  return handleApplyRequest(supabase, user.id, body);
}
