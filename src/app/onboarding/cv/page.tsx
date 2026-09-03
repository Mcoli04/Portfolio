"use client";

import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function UploadCvStep() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
    if (!file) return;
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Let&apos;s start with your CV</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
          "mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition",
          dragActive ? "border-brand-500 bg-brand-50/60" : "border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40"
        )}
      >
        {file ? (
          <>
            <FileText className="h-9 w-9 text-brand-600" />
            <p className="mt-3 text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB — tap to change</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-9 w-9 text-slate-400" />
            <p className="mt-3 text-base font-semibold text-slate-800">Upload your CV</p>
            <p className="mt-1 text-xs text-slate-400">Drag and drop, or tap to browse — PDF, DOC or DOCX</p>
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

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        Your CV stays private. Employers only receive it when you choose to apply.
      </p>

      <Button onClick={handleUpload} disabled={!file || uploading} size="lg" className="mt-6 w-full rounded-full">
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your CV...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </div>
  );
}
