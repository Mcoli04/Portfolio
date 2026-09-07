import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { expireStaleJobs } from "@/lib/jobs/ingest";

export const runtime = "nodejs";

/** Marks jobs past expires_at inactive (spec §25). Run frequently, e.g. every 15 minutes. */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await expireStaleJobs(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Expiry check failed" },
      { status: 500 }
    );
  }
}

export const GET = POST;
