import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ApplicationAutomationEngine } from "@/lib/applications/engine";
import { claimApplicationForProcessing } from "@/lib/applications/claim";
import type { Job, Profile, ResumeVersion } from "@/lib/types/database";

export const runtime = "nodejs";

// Matches the standalone worker's STUCK_THRESHOLD_MS — one consistent
// stale-recovery policy everywhere a stuck "applying" row can be reclaimed,
// not a separate/looser admin-only allowance.
const STUCK_THRESHOLD_MS = 2 * 60 * 1000;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { data: application } = await admin.supabase.from("applications").select("*").eq("id", params.id).single();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // Atomic claim — an admin retry must never run concurrently with the
  // worker (or another admin click) already processing this same row.
  // Only genuinely retryable statuses, or an "applying" row stuck past the
  // same threshold the worker uses, can be claimed here — an actively
  // processing row correctly fails this and is left alone.
  const claimed = await claimApplicationForProcessing(admin.supabase, application.id, {
    allowStaleApplyingOlderThanMs: STUCK_THRESHOLD_MS,
  });
  if (!claimed) {
    return NextResponse.json({ error: "This application is already being processed and cannot be retried right now." }, { status: 409 });
  }

  const { data: job } = await admin.supabase.from("jobs").select("*").eq("id", claimed.job_id).single<Job>();
  const { data: profile } = await admin.supabase.from("profiles").select("*").eq("id", claimed.user_id).single<Profile>();
  if (!job || !profile) return NextResponse.json({ error: "Related job or profile missing" }, { status: 404 });

  let resumeVersion: ResumeVersion | null = null;
  if (profile.default_resume_id) {
    const { data: resume } = await admin.supabase
      .from("resumes")
      .select("latest_version_id")
      .eq("id", profile.default_resume_id)
      .single();
    if (resume?.latest_version_id) {
      const { data: version } = await admin.supabase
        .from("resume_versions")
        .select("*")
        .eq("id", resume.latest_version_id)
        .single<ResumeVersion>();
      resumeVersion = version ?? null;
    }
  }

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase: admin.supabase, application: claimed, job, profile, resumeVersion });

  return NextResponse.json({ ok: true, outcome });
}
