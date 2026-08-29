"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { ParsedCvData } from "@/lib/types/database";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  yearsExperience: string;
  skills: string;
  jobTitles: string;
  employers: string;
  languages: string;
  industries: string;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  yearsExperience: "",
  skills: "",
  jobTitles: "",
  employers: "",
  languages: "",
  industries: "",
};

function toCsv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

function fromCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function ReviewCvStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const { data: resume } = await supabase
        .from("resumes")
        .select("latest_version_id")
        .eq("id", profile?.default_resume_id)
        .single();

      let parsed: ParsedCvData | null = null;
      if (resume?.latest_version_id) {
        const { data: version } = await supabase
          .from("resume_versions")
          .select("parsed_data")
          .eq("id", resume.latest_version_id)
          .single();
        parsed = version?.parsed_data ?? null;
        setWarnings(parsed?.warnings ?? []);
      }

      setForm({
        fullName: parsed?.fullName ?? profile?.full_name ?? "",
        email: parsed?.email ?? profile?.email ?? user.email ?? "",
        phone: parsed?.phone ?? profile?.phone ?? "",
        location: parsed?.location ?? profile?.location ?? "",
        yearsExperience: String(parsed?.yearsExperience ?? profile?.years_experience ?? ""),
        skills: toCsv(parsed?.skills ?? profile?.skills),
        jobTitles: toCsv(parsed?.jobTitles ?? profile?.job_titles),
        employers: toCsv(parsed?.employers ?? profile?.employers),
        languages: toCsv(parsed?.languages ?? profile?.languages),
        industries: toCsv(parsed?.industries ?? profile?.industries),
      });
      setLoading(false);
    }
    load();
  }, []);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName || null,
          phone: form.phone || null,
          location: form.location || null,
          years_experience: form.yearsExperience ? Number(form.yearsExperience) : null,
          skills: fromCsv(form.skills),
          job_titles: fromCsv(form.jobTitles),
          employers: fromCsv(form.employers),
          languages: fromCsv(form.languages),
          industries: fromCsv(form.industries),
          onboarding_step: "preferences",
        })
        .eq("id", user.id);

      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/onboarding/preferences");
    } finally {
      setSaving(false);
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
      <h1 className="text-xl font-bold text-slate-900">Review your details</h1>
      <p className="mt-1 text-sm text-slate-600">
        Here&apos;s what we found in your CV. Please correct anything that&apos;s wrong — we never guess beyond what you confirm here.
      </p>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" value={form.fullName} onChange={(v) => update("fullName", v)} />
        <Field label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" />
        <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} />
        <Field label="Location" value={form.location} onChange={(v) => update("location", v)} />
        <Field label="Years of experience" value={form.yearsExperience} onChange={(v) => update("yearsExperience", v)} type="number" />
      </div>

      <div className="mt-4 space-y-4">
        <Field label="Skills (comma separated)" value={form.skills} onChange={(v) => update("skills", v)} textarea />
        <Field label="Job titles held (comma separated)" value={form.jobTitles} onChange={(v) => update("jobTitles", v)} />
        <Field label="Employers (comma separated)" value={form.employers} onChange={(v) => update("employers", v)} />
        <Field label="Languages (comma separated)" value={form.languages} onChange={(v) => update("languages", v)} />
        <Field label="Industries (comma separated)" value={form.industries} onChange={(v) => update("industries", v)} />
      </div>

      <Button onClick={handleSave} disabled={saving} className="mt-8 w-full">
        {saving ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
      )}
    </div>
  );
}
