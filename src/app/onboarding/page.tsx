import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OnboardingStep, Profile } from "@/lib/types/database";

const STEP_ROUTES: Record<OnboardingStep, string> = {
  create_account: "/onboarding/cv",
  upload_cv: "/onboarding/cv",
  parse_cv: "/onboarding/cv",
  review_cv: "/onboarding/review",
  goals: "/onboarding/goals",
  preferences: "/onboarding/preferences",
  salary: "/onboarding/salary",
  auto_apply_mode: "/onboarding/auto-apply",
  consent: "/onboarding/consent",
  complete: "/discover",
};

export default async function OnboardingIndexPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  redirect(STEP_ROUTES[profile?.onboarding_step ?? "upload_cv"]);
}
