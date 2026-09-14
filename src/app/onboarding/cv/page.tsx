"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function UploadCvStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [hasExistingCv, setHasExistingCv] = useState(false);
  const [existingLabel, setExistingLabel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    async function checkExisting() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("default_resume_id").eq("id", user.id).single();
      if (profile?.default_resume_id) {
        const { data: resume } = await supabase.from("resumes").select("label").eq("id", profile.default_resume_id).single();
        setHasExistingCv(true);
        setExistingLabel(resume?.label ?? "your CV");
      }
      setLoading(false);
    }
    checkExisting();
  }, []);

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (!isAllowedFile(dropped)) {
      toast.error("Please upload a PDF, DOC or DOCX file.");
      return;
    }
    setFile(dropped);
  }

  async function handleUpload() {
    if (!file) {
      if (hasExistingCv) router.push("/onboarding/review");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", "General CV");
      formData.append("setAsDefault", "true");

      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }
      toast.success("Got it — we've read your CV.");
      router.push("/onboarding/review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <OnboardingProgress phaseIndex={0} progress={0.5} />

      <div className="mt-8 lg:mt-10">
        <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl lg:text-3xl">
          Let&apos;s start with your CV
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 lg:text-base">
          Upload your CV and we&apos;ll fill in most of your profile for you.
        </p>

        <label
          htmlFor="cv-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition lg:mt-10 lg:py-16",
            dragActive ? "border-brand-500 bg-brand-50/60" : "border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40"
          )}
        >
          {file ? (
            <>
              <FileText className="h-8 w-8 text-brand-600 lg:h-10 lg:w-10" />
              <p className="mt-3 text-sm font-medium text-slate-900 lg:text-base">{file.name}</p>
              <p className="text-xs text-slate-500 lg:text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB — tap to change</p>
            </>
          ) : hasExistingCv ? (
            <>
              <FileText className="h-8 w-8 text-brand-600 lg:h-10 lg:w-10" />
              <p className="mt-3 text-base font-semibold text-slate-800 lg:text-lg">CV uploaded — {existingLabel}</p>
              <p className="mt-1 text-xs text-slate-400 lg:text-sm">Tap to upload a different one</p>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-slate-400 lg:h-10 lg:w-10" />
              <p className="mt-3 text-base font-semibold text-slate-800 lg:text-lg">Upload your CV</p>
              <p className="mt-1 text-xs text-slate-400 lg:text-sm">Drag and drop, or tap to browse — PDF, DOC or DOCX</p>
            </>
          )}
          <input
            id="cv-file"
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500 lg:text-sm">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          Your CV stays private. Employers only receive it when you choose to apply.
        </p>

        <OnboardingContinueButton
          onClick={handleUpload}
          disabled={!file && !hasExistingCv}
          loading={uploading}
          loadingLabel="Reading your CV..."
        />
      </div>
    </div>
  );
}
