import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AnswerLibraryEntry, Profile } from "@/lib/types/database";
import { AutoApplySettings } from "@/components/settings/auto-apply-settings";
import { WorkAuthorizationCard } from "@/components/settings/work-authorization-card";
import { AnswerLibraryCard } from "@/components/settings/answer-library-card";
import { DangerZone } from "@/components/settings/danger-zone";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) return null;

  const { data: answerLibrary } = await supabase
    .from("answer_library")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<AnswerLibraryEntry[]>();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage Auto Apply, authorization, and your account.</p>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 p-6">
        <AutoApplySettings profile={profile} />
        <WorkAuthorizationCard profile={profile} />
        <AnswerLibraryCard userId={user.id} entries={answerLibrary ?? []} />
        <DangerZone />
      </div>
    </div>
  );
}
