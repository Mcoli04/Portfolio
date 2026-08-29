"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export default function UploadCvStep() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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
      toast.success("CV uploaded and parsed.");
      router.push("/onboarding/review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Upload your CV</h1>
      <p className="mt-1 text-sm text-slate-600">
        We&apos;ll extract your skills and experience automatically. You&apos;ll get to review and correct everything next.
      </p>

      <label
        htmlFor="cv-file"
        className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
      >
        {file ? (
          <>
            <FileText className="h-8 w-8 text-brand-600" />
            <p className="mt-3 text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)} MB — click to change</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">Click to upload or drag your CV here</p>
            <p className="text-xs text-slate-400">PDF, DOC or DOCX — up to 8MB</p>
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

      <Button onClick={handleUpload} disabled={!file || uploading} className="mt-6 w-full">
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Parsing your CV...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </div>
  );
}
