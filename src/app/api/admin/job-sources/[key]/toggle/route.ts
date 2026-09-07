import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { key: string } }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { data: source } = await admin.supabase.from("job_sources").select("enabled").eq("key", params.key).single();
  if (!source) return NextResponse.json({ error: "Job source not found" }, { status: 404 });

  const { error } = await admin.supabase.from("job_sources").update({ enabled: !source.enabled }).eq("key", params.key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, enabled: !source.enabled });
}
