"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagInput } from "@/components/ui/tag-input";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { SingleChoiceQuestion } from "@/components/onboarding/single-choice-question";
import { MultiChoiceQuestion } from "@/components/onboarding/multi-choice-question";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import {
  MALTA_LOCALITIES,
  isAllMaltaLocations,
  isMaltaLocalitySelected,
  selectAllMaltaLocations,
  toggleAllMaltaLocations,
  toggleMaltaLocality,
} from "@/lib/malta-locations";
import { cn } from "@/lib/utils";
import type { EmploymentType, ExperienceLevel, RemoteScope, WorkType } from "@/lib/types/database";

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

const WORK_TYPES: { value: WorkType | "any"; label: string }[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "any", label: "I'm flexible" },
];

const REMOTE_SCOPES: { value: RemoteScope; label: string }[] = [
  { value: "malta_only", label: "Malta only" },
  { value: "eu_eea", label: "EU / EEA" },
  { value: "europe", label: "Europe" },
  { value: "worldwide", label: "Worldwide" },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
];

const EXPERIENCE_LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "entry", label: "Just starting out" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead / Management" },
  { value: "executive", label: "Executive" },
];

type StepKey = "jobTitle" | "locations" | "workType" | "remoteScope" | "employmentType" | "experienceLevel";

function getSteps(workType: WorkType | "any" | null): StepKey[] {
  const steps: StepKey[] = ["jobTitle", "locations", "workType"];
  if (workType === "remote") steps.push("remoteScope");
  steps.push("employmentType", "experienceLevel");
  return steps;
}

export default function PreferencesStep() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<StepKey>("jobTitle");
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  // New users start matched against every locality in Malta.
  const [locations, setLocations] = useState<string[]>(selectAllMaltaLocations());
  const [workType, setWorkType] = useState<WorkType | "any" | null>(null);
  const [remoteScope, setRemoteScope] = useState<RemoteScope | null>(null);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [saving, setSaving] = useState(false);

  const steps = getSteps(workType);
  const stepIndex = steps.indexOf(currentStep);

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

  function goNext(fromWorkType?: WorkType | "any" | null) {
    const activeSteps = getSteps(fromWorkType !== undefined ? fromWorkType : workType);
    const idx = activeSteps.indexOf(currentStep);
    if (idx === -1 || idx === activeSteps.length - 1) {
      handleFinish(fromWorkType !== undefined ? fromWorkType : workType);
      return;
    }
    setCurrentStep(activeSteps[idx + 1]);
  }

  function goBack() {
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  }

  async function handleFinish(finalWorkType: WorkType | "any" | null = workType) {
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
          work_types: finalWorkType === "any" || !finalWorkType ? ["any"] : [finalWorkType],
          remote_scope: finalWorkType === "remote" ? remoteScope : null,
          employment_types: employmentTypes,
          experience_levels: experienceLevel ? [experienceLevel] : [],
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
      <OnboardingProgress phaseIndex={2} progress={stepIndex / steps.length} />

      {stepIndex > 0 && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="mt-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className={stepIndex > 0 ? "mt-4" : "mt-8"}>
        {currentStep === "jobTitle" && (
          <div>
            <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
              What kind of job would you like next?
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500">Add one or more job titles.</p>
            <div className="mt-6">
              <TagInput value={jobTitles} onChange={setJobTitles} suggestions={JOB_TITLE_SUGGESTIONS} placeholder="e.g. Accountant, Sales Assistant" />
            </div>
            <OnboardingContinueButton onClick={() => goNext()} />
          </div>
        )}

        {currentStep === "locations" && (
          <div>
            <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
              Where would you like to work?
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500">Pick specific localities, or stay open to all of Malta.</p>

            <div className="mt-6">
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
              <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-slate-200 p-3">
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
            </div>
            <OnboardingContinueButton onClick={() => goNext()} />
          </div>
        )}

        {currentStep === "workType" && (
          <SingleChoiceQuestion
            question="How would you prefer to work?"
            options={WORK_TYPES}
            value={workType}
            onSelect={(v) => {
              setWorkType(v);
              setTimeout(() => goNext(v), 300);
            }}
          />
        )}

        {currentStep === "remoteScope" && (
          <SingleChoiceQuestion
            question="Where are you open to working remotely?"
            helper="This helps us match remote roles that make sense for you."
            options={REMOTE_SCOPES}
            value={remoteScope}
            onSelect={(v) => {
              setRemoteScope(v);
              setTimeout(() => goNext(), 300);
            }}
          />
        )}

        {currentStep === "employmentType" && (
          <>
            <MultiChoiceQuestion
              question="What type of work are you open to?"
              helper="Pick as many as apply."
              options={EMPLOYMENT_TYPES}
              value={employmentTypes}
              onToggle={(v) => setEmploymentTypes((prev) => (prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v]))}
            />
            <OnboardingContinueButton onClick={() => goNext()} disabled={employmentTypes.length === 0} />
          </>
        )}

        {currentStep === "experienceLevel" && (
          <SingleChoiceQuestion
            question="What level best describes you?"
            options={EXPERIENCE_LEVELS}
            value={experienceLevel}
            onSelect={(v) => {
              setExperienceLevel(v);
              setTimeout(() => handleFinish(), 300);
            }}
          />
        )}

        {saving && currentStep === "experienceLevel" && (
          <p className="mt-4 text-center text-xs text-slate-400">Saving your preferences...</p>
        )}
      </div>
    </div>
  );
}
