import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import type { OnboardingStep, Profile } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const TOTAL_STEPS = 5;

function stepMeta(step: OnboardingStep): { index: number; label?: string } {
  switch (step) {
    case "create_account":
    case "upload_cv":
    case "parse_cv":
      return { index: 1 };
    case "review_cv":
      return { index: 2 };
    case "preferences":
      return { index: 3 };
    case "salary":
      return { index: 4 };
    case "auto_apply_mode":
      return { index: 5 };
    case "consent":
    case "complete":
      return { index: 5, label: "Almost done" };
  }
}

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.onboarding_completed) redirect("/discover");

  // A first name collected during signup is stored in the auth user's
  // metadata; backfill it onto the profile row the first time we see it
  // hasn't landed there yet (e.g. it arrived while email confirmation was
  // still pending, before any profile update could run).
  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  if (profile && !profile.full_name && metadataName) {
    await supabase.from("profiles").update({ full_name: metadataName }).eq("id", user.id);
    profile.full_name = metadataName;
  }

  const { index, label } = stepMeta(profile?.onboarding_step ?? "upload_cv");

  return (
    <OnboardingShell step={index} total={TOTAL_STEPS} progressLabel={label}>
      {children}
    </OnboardingShell>
  );
}
