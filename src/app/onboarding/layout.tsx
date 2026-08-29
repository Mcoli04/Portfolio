import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingStepper } from "@/components/onboarding/stepper";
import type { Profile } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.onboarding_completed) redirect("/discover");

  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <OnboardingStepper currentStep={profile?.onboarding_step ?? "upload_cv"} />
        <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-8 shadow-card">{children}</div>
      </div>
    </main>
  );
}
