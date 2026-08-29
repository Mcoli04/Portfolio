import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Resume } from "@/lib/types/database";
import { ProfileForm } from "@/components/profile/profile-form";
import { ResumeManager } from "@/components/profile/resume-manager";

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

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-500">Your details, skills and CVs.</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 p-6">
        <ProfileForm profile={profile} />
        <ResumeManager resumes={resumes ?? []} defaultResumeId={profile.default_resume_id} />
      </div>
    </div>
  );
}
