import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
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

  // A first name collected during signup is stored in the auth user's
  // metadata; backfill it onto the profile row the first time we see it
  // hasn't landed there yet (e.g. it arrived while email confirmation was
  // still pending, before any profile update could run).
  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  if (profile && !profile.full_name && metadataName) {
    // At signup this metadata value is just the first name the user typed
    // (see (auth)/signup), so it's a safe, correct first_name value too —
    // not a heuristic split of a longer name.
    await supabase.from("profiles").update({ full_name: metadataName, first_name: metadataName }).eq("id", user.id);
  }

  return <OnboardingShell>{children}</OnboardingShell>;
}
