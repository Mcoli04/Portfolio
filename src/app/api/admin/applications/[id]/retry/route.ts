import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ApplicationAutomationEngine } from "@/lib/applications/engine";
import type { Job, Profile, ResumeVersion } from "@/lib/types/database";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { data: application } = await admin.supabase.from("applications").select("*").eq("id", params.id).single();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const { data: job } = await admin.supabase.from("jobs").select("*").eq("id", application.job_id).single<Job>();
  const { data: profile } = await admin.supabase.from("profiles").select("*").eq("id", application.user_id).single<Profile>();
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
  const outcome = await engine.run({ supabase: admin.supabase, application, job, profile, resumeVersion });

  return NextResponse.json({ ok: true, outcome });
}
