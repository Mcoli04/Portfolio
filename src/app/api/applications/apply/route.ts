import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApplicationAutomationEngine } from "@/lib/applications/engine";
import { decideSwipeRightAction } from "@/lib/applications/auto-apply-mode";
import type { Job, Profile, ResumeVersion } from "@/lib/types/database";

export const runtime = "nodejs";

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
 * Swipe-right endpoint (spec §22-25, §32). Enforces the duplicate-application
 * unique constraint, respects the user's Auto Apply mode, and only ever runs
 * the automation engine when the user has explicitly authorized Auto Apply.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { jobId, matchScore, force } = await req.json();
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing && existing.status !== "failed" && !force) {
    return NextResponse.json({ error: "You've already applied to this job.", application: existing }, { status: 409 });
  }

  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single<Job>();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.active) {
    return NextResponse.json({ error: "This job is no longer active." }, { status: 410 });
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await supabase.from("job_interactions").upsert(
    { user_id: user.id, job_id: jobId, action: "saved", match_score: matchScore ?? null },
    { onConflict: "user_id,job_id" }
  );

  const action = decideSwipeRightAction(profile.auto_apply_mode, matchScore ?? 0);

  const applicationPayload = {
    user_id: user.id,
    job_id: jobId,
    company_id: job.company_id,
    resume_id: profile.default_resume_id,
    match_score: matchScore ?? null,
    application_method: job.application_method,
    status: action === "add_to_review_queue" ? ("queued" as const) : ("applying" as const),
  };

  const { data: application, error: applicationError } = existing
    ? await supabase.from("applications").update(applicationPayload).eq("id", existing.id).select().single()
    : await supabase.from("applications").insert(applicationPayload).select().single();

  if (applicationError || !application) {
    return NextResponse.json({ error: applicationError?.message ?? "Could not create application" }, { status: 500 });
  }

  await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "APPLICATION_CREATED",
    metadata: { matchScore, autoApplyAction: action },
  });

  if (action === "add_to_review_queue") {
    return NextResponse.json({ status: "queued", application });
  }

  if (action === "confirm_then_submit" && !force) {
    return NextResponse.json({ status: "confirmation_required", application, matchScore });
  }

  const resumeVersion = await getDefaultResumeVersion(supabase, profile);

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({
    supabase,
    application,
    job,
    profile,
    resumeVersion,
  });

  return NextResponse.json({ status: outcome.status, outcome, application });
}
