import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractCvText } from "@/lib/cv/extract-text";
import { parseCvWithAi } from "@/lib/ai/cv-parser";
import { idsToClearForNewDefault } from "@/lib/resumes/default";

export const runtime = "nodejs";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const label = (form.get("label") as string | null) ?? "General CV";
  const setAsDefault = form.get("setAsDefault") === "true";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type. Please upload a PDF, DOC or DOCX." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large (max 8MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${user.id}/${crypto.randomUUID()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from("resumes").upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  if (setAsDefault) {
    // Clear every existing default first (not just the most recent one, in
    // case duplicates already slipped in) so this insert can never coexist
    // with a stale default — see migration 0008's
    // resumes_one_default_per_user unique index, which this ordering keeps
    // us on the right side of.
    const { data: existingResumes } = await supabase.from("resumes").select("id, is_default").eq("user_id", user.id);
    const idsToClear = idsToClearForNewDefault(
      (existingResumes ?? []).map((r) => ({ id: r.id, isDefault: r.is_default }))
    );
    if (idsToClear.length > 0) {
      await supabase.from("resumes").update({ is_default: false }).in("id", idsToClear);
    }
  }

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .insert({ user_id: user.id, label, is_default: setAsDefault })
    .select()
    .single();
  if (resumeError || !resume) {
    return NextResponse.json({ error: `Could not create resume record: ${resumeError?.message}` }, { status: 500 });
  }

  const { text, warnings: extractWarnings } = await extractCvText(buffer, file.type, file.name);
  const parsed = await parseCvWithAi(text);
  parsed.warnings = [...extractWarnings, ...parsed.warnings];

  const { data: version, error: versionError } = await supabase
    .from("resume_versions")
    .insert({
      resume_id: resume.id,
      user_id: user.id,
      version_number: 1,
      file_path: storagePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      parse_status: text.trim() ? "parsed" : "failed",
      parsed_data: parsed,
      parse_error: text.trim() ? null : "Could not extract text from file",
    })
    .select()
    .single();
  if (versionError || !version) {
    return NextResponse.json({ error: `Could not save parsed CV: ${versionError?.message}` }, { status: 500 });
  }

  await supabase.from("resumes").update({ latest_version_id: version.id }).eq("id", resume.id);

  if (setAsDefault || resume.is_default) {
    await supabase.from("profiles").update({ default_resume_id: resume.id }).eq("id", user.id);
  }

  await supabase
    .from("profiles")
    .update({ onboarding_step: "review_cv" })
    .eq("id", user.id)
    .eq("onboarding_step", "upload_cv");

  return NextResponse.json({ resume, resumeVersion: version, parsed });
}
