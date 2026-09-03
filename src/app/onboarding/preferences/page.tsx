"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Home, Shuffle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-select";
import { OptionCard } from "@/components/ui/option-card";
import { TagInput } from "@/components/ui/tag-input";
import {
  MALTA_LOCALITIES,
  isAllMaltaLocations,
  isMaltaLocalitySelected,
  selectAllMaltaLocations,
  toggleAllMaltaLocations,
  toggleMaltaLocality,
} from "@/lib/malta-locations";
import { cn } from "@/lib/utils";
import type { EmploymentType, ExperienceLevel, WorkType } from "@/lib/types/database";

const JOB_TITLE_SUGGESTIONS = [
  "Accountant",
  "Sales Assistant",
  "Software Developer",
  "Customer Support",
  "Administrator",
  "Marketing Executive",
  "Warehouse Operative",
  "Receptionist",
  "Nurse",
  "Teacher",
  "Driver",
  "Chef",
];

const WORK_PREFERENCES: { value: WorkType | "any"; title: string; icon: typeof Home }[] = [
  { value: "onsite", title: "On-site", icon: Building2 },
  { value: "hybrid", title: "Hybrid", icon: Shuffle },
  { value: "remote", title: "Remote", icon: Home },
  { value: "any", title: "I'm flexible", icon: Sparkles },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Just starting out" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead / Management" },
  { value: "executive", label: "Executive" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function PreferencesStep() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  // New users start matched against every locality in Malta.
  const [locations, setLocations] = useState<string[]>(selectAllMaltaLocations());
  const [workType, setWorkType] = useState<WorkType | "any">("any");
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  const [experienceLevels, setExperienceLevels] = useState<ExperienceLevel[]>([]);

  useEffect(() => {
    async function prefillFromProfile() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("job_titles").eq("id", user.id).single();
      if (profile?.job_titles?.length) setJobTitles(profile.job_titles);
    }
    prefillFromProfile();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("job_preferences").upsert(
        {
          user_id: user.id,
          job_titles: jobTitles,
          custom_titles: [],
          locations,
          work_types: workType === "any" ? ["any"] : [workType],
          employment_types: employmentTypes,
          experience_levels: experienceLevels,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        toast.error(error.message);
        return;
      }

      await supabase.from("profiles").update({ onboarding_step: "salary" }).eq("id", user.id);
      router.push("/onboarding/salary");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">What kind of job would you like next?</h1>
      <p className="mt-2 text-sm text-slate-600">This helps us bring the right roles to the top for you.</p>

      <div className="mt-6 space-y-7">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Job title</label>
          <TagInput
            value={jobTitles}
            onChange={setJobTitles}
            suggestions={JOB_TITLE_SUGGESTIONS}
            placeholder="e.g. Accountant, Sales Assistant"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Where in Malta?</label>
          <button
            type="button"
            onClick={() => setLocations((prev) => toggleAllMaltaLocations(prev))}
            aria-pressed={isAllMaltaLocations(locations)}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
              isAllMaltaLocations(locations)
                ? "border-brand-600 bg-brand-50/60 text-brand-700"
                : "border-slate-200 text-slate-700 hover:border-brand-300"
            )}
          >
            Anywhere in Malta
          </button>
          <div className="mt-3 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-slate-200 p-3">
            {MALTA_LOCALITIES.map((locality) => (
              <button
                key={locality}
                type="button"
                onClick={() => setLocations((prev) => toggleMaltaLocality(prev, locality))}
                aria-pressed={isMaltaLocalitySelected(locations, locality)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  isMaltaLocalitySelected(locations, locality)
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-brand-300"
                )}
              >
                {locality}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Pick specific localities to narrow things down — that switches off Anywhere in Malta. Tap Anywhere in
            Malta again any time to match everywhere.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Work preference</label>
          <div className="grid grid-cols-2 gap-3">
            {WORK_PREFERENCES.map((option) => (
              <OptionCard
                key={option.value}
                selected={workType === option.value}
                onClick={() => setWorkType(option.value)}
                icon={option.icon}
                title={option.title}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Employment type</label>
          <ChipGroup options={EMPLOYMENT_TYPES} value={employmentTypes} onToggle={(v) => setEmploymentTypes((prev) => toggle(prev, v))} />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Experience level</label>
          <ChipGroup options={EXPERIENCE_LEVELS} value={experienceLevels} onToggle={(v) => setExperienceLevels((prev) => toggle(prev, v))} />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} size="lg" className="mt-8 w-full rounded-full">
        {saving ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
