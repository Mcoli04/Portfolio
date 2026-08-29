import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DesktopSidebar, MobileNav } from "@/components/app/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("onboarding_completed").eq("id", user.id).single();
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <DesktopSidebar />
      <div className="flex-1 pb-16 sm:pb-0">{children}</div>
      <MobileNav />
    </div>
  );
}
