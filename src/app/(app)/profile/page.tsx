import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Resume } from "@/lib/types/database";
import { ProfileForm } from "@/components/profile/profile-form";
import { ResumeManager } from "@/components/profile/resume-manager";
import { resolveSingleDefaultId } from "@/lib/resumes/default";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  const { data: resumes } = await supabase
    .from("resumes")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Resume[]>();

  if (!profile) return null;

  const resumeList = resumes ?? [];
  // A single, canonical default signal for the UI — resolved here rather
  // than trusted per-row, so resumes.is_default and profiles.default_resume_id
  // disagreeing (see migration 0008) can never render more than one CV as
  // default. Once resolved, only this id is passed down.
  const defaultResumeId = resolveSingleDefaultId(
    resumeList.map((r) => ({ id: r.id, isDefault: r.is_default, updatedAt: r.updated_at })),
    profile.default_resume_id
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500">Your details, skills and CVs.</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 p-6">
        <ProfileForm profile={profile} />
        <ResumeManager resumes={resumeList} defaultResumeId={defaultResumeId} />
      </div>
    </div>
  );
}
