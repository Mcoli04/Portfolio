"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Star, UploadCloud, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Resume } from "@/lib/types/database";

export function ResumeManager({ resumes, defaultResumeId }: { resumes: Resume[]; defaultResumeId: string | null }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState("General CV");

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", label);
      formData.append("setAsDefault", resumes.length === 0 ? "true" : "false");
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      toast.success("CV uploaded.");
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setDefault(resumeId: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("resumes").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("resumes").update({ is_default: true }).eq("id", resumeId);
    await supabase.from("profiles").update({ default_resume_id: resumeId }).eq("id", user.id);
    toast.success("Default CV updated.");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Your CVs</h2>
      <p className="mt-1 text-xs text-slate-500">Upload multiple versions (e.g. General, Software Engineering, Marketing) and choose a default.</p>

      <div className="mt-4 space-y-2">
        {resumes.map((resume) => (
          <div key={resume.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-900">{resume.label}</span>
              {resume.id === defaultResumeId && (
                <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                  <Star className="h-3 w-3" /> Default
                </span>
              )}
            </div>
            {resume.id !== defaultResumeId && (
              <button onClick={() => setDefault(resume.id)} className="text-xs font-medium text-brand-600 hover:underline">
                Make default
              </button>
            )}
          </div>
        ))}
        {resumes.length === 0 && <p className="text-sm text-slate-400">No CVs uploaded yet.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Software Engineering CV)"
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload CV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
      </div>
    </section>
  );
}
