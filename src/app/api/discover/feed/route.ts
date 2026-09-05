import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDiscoverFeed } from "@/lib/jobs/discover-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const excludeIds = new Set((req.nextUrl.searchParams.get("excludeIds") ?? "").split(",").filter(Boolean));
  const { jobs } = await getDiscoverFeed(supabase, user.id, 30);
  const filtered = jobs.filter((job) => !excludeIds.has(job.id)).slice(0, 15);

  return NextResponse.json({ jobs: filtered });
}
