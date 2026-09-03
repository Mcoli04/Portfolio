"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagInput } from "@/components/ui/tag-input";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { cn } from "@/lib/utils";
import type { ParsedCvData } from "@/lib/types/database";

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  yearsExperience: string;
  jobTitles: string[];
  employers: string[];
  industries: string[];
  skills: string[];
  languages: string[];
}

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  yearsExperience: "",
  jobTitles: [],
  employers: [],
  industries: [],
  skills: [],
  languages: [],
};

export default function ReviewCvStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hadWarnings, setHadWarnings] = useState(false);
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
        setHadWarnings((parsed?.warnings?.length ?? 0) > 0);
      }

      setForm({
        fullName: parsed?.fullName ?? profile?.full_name ?? "",
        email: parsed?.email ?? profile?.email ?? user.email ?? "",
        phone: parsed?.phone ?? profile?.phone ?? "",
        location: parsed?.location ?? profile?.location ?? "",
        yearsExperience: String(parsed?.yearsExperience ?? profile?.years_experience ?? ""),
        jobTitles: parsed?.jobTitles ?? profile?.job_titles ?? [],
        employers: parsed?.employers ?? profile?.employers ?? [],
        industries: parsed?.industries ?? profile?.industries ?? [],
        skills: parsed?.skills ?? profile?.skills ?? [],
        languages: parsed?.languages ?? profile?.languages ?? [],
      });
      setLoading(false);
    }
    load();
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
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
          skills: form.skills,
          job_titles: form.jobTitles,
          employers: form.employers,
          industries: form.industries,
          languages: form.languages,
          onboarding_step: "goals",
        })
        .eq("id", user.id);

      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/onboarding/goals");
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
      <OnboardingProgress phaseIndex={0} progress={1} />

      <h1 className="mt-8 text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
        Here&apos;s your profile
      </h1>

      {hadWarnings && (
        <div className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-2xl bg-brand-50 p-3 text-xs leading-relaxed text-brand-800">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          We&apos;ve filled this in from your CV. Give it a quick check before continuing.
        </div>
      )}
      {!hadWarnings && (
        <p className="mt-2 text-center text-sm text-slate-500">
          We&apos;ve filled this in from your CV — check it over and fix anything that&apos;s not quite right.
        </p>
      )}

      <Section title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={form.fullName} onChange={(v) => update("fullName", v)} needsAttention={!form.fullName} />
          <Field label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" />
          <Field label="Phone" value={form.phone} onChange={(v) => update("phone", v)} needsAttention={!form.phone} />
          <Field label="Location" value={form.location} onChange={(v) => update("location", v)} needsAttention={!form.location} />
        </div>
      </Section>

      <Section title="Your experience">
        <Field
          label="Years of experience"
          value={form.yearsExperience}
          onChange={(v) => update("yearsExperience", v)}
          type="number"
          needsAttention={!form.yearsExperience}
        />
        <TagField label="Job titles you've held" value={form.jobTitles} onChange={(v) => update("jobTitles", v)} placeholder="e.g. Sales Assistant" />
        <TagField label="Employers" value={form.employers} onChange={(v) => update("employers", v)} placeholder="e.g. Malta Retail Group" />
        <TagField label="Industries" value={form.industries} onChange={(v) => update("industries", v)} placeholder="e.g. Retail, Hospitality" />
      </Section>

      <Section title="Skills">
        <TagField label="Skills" value={form.skills} onChange={(v) => update("skills", v)} placeholder="e.g. Customer Service, Excel" hideLabel />
      </Section>

      <Section title="Languages">
        <TagField label="Languages" value={form.languages} onChange={(v) => update("languages", v)} placeholder="e.g. Maltese, English" hideLabel />
      </Section>

      <OnboardingContinueButton onClick={handleSave} loading={saving} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 border-t border-slate-100 pt-6 first:mt-6 first:border-t-0 first:pt-0">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  needsAttention = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  needsAttention?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-2xl border px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500",
          needsAttention ? "border-amber-300 bg-amber-50/40" : "border-slate-300"
        )}
      />
      {needsAttention && <p className="mt-1 text-xs text-amber-600">We couldn&apos;t find this — add it if you&apos;d like.</p>}
    </div>
  );
}

function TagField({
  label,
  value,
  onChange,
  placeholder,
  hideLabel = false,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>}
      <TagInput value={value} onChange={onChange} placeholder={placeholder} />
      {value.length === 0 && <p className="mt-1 text-xs text-amber-600">We couldn&apos;t find any — add a few if you&apos;d like.</p>}
    </div>
  );
}
