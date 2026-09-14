import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscoverFeed } from "@/lib/jobs/discover-feed";
import { DiscoverClient } from "@/components/discover/discover-client";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { jobs, profile } = await getDiscoverFeed(supabase, user.id, 15);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Discover</h1>
        <p className="text-sm text-slate-500">Malta roles matched to your profile — swipe right to apply.</p>
      </header>
      <DiscoverClient initialJobs={jobs} profile={profile} />
    </div>
  );
}
