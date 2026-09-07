import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

/**
 * Account deletion (spec §43). Deletes the auth user via the service role,
 * which cascades to profiles, resumes, applications, etc. through the
 * foreign keys declared "on delete cascade" in the schema — including the
 * user's CVs and generated documents.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const serviceRole = createServiceRoleClient();

    const { data: resumeVersions } = await serviceRole.from("resume_versions").select("file_path").eq("user_id", user.id);
    const paths = (resumeVersions ?? []).map((r: { file_path: string }) => r.file_path);
    if (paths.length) await serviceRole.storage.from("resumes").remove(paths);

    const { error } = await serviceRole.auth.admin.deleteUser(user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Account deletion is not available (service role not configured)." },
      { status: 500 }
    );
  }
}
