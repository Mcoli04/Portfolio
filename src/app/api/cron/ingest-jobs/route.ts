import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { ingestJobs } from "@/lib/jobs/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Job ingestion cron endpoint (spec §41). Intended to run every 15-30
 * minutes via an external scheduler (Vercel Cron, GitHub Actions, etc.)
 * hitting this route with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServiceRoleClient();
    const summary = await ingestJobs(supabase);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ingestion failed" },
      { status: 500 }
    );
  }
}

export const GET = POST;
