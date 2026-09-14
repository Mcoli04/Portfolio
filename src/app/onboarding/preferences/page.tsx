"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TagInput } from "@/components/ui/tag-input";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { SingleChoiceQuestion } from "@/components/onboarding/single-choice-question";
import { MultiChoiceQuestion } from "@/components/onboarding/multi-choice-question";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { OnboardingBackButton } from "@/components/onboarding/onboarding-back-button";
import { getPreferencesSteps, getPreviousPageHref, type PreferencesStepKey } from "@/lib/onboarding-flow";
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

const ALL_STEP_KEYS: PreferencesStepKey[] = getPreferencesSteps("remote");

function initialStep(step: string | null): PreferencesStepKey {
  return ALL_STEP_KEYS.includes(step as PreferencesStepKey) ? (step as PreferencesStepKey) : "jobTitle";
}

function PreferencesStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<PreferencesStepKey>(() => initialStep(searchParams.get("step")));
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  // New users start matched against every locality in Malta.
  const [locations, setLocations] = useState<string[]>(selectAllMaltaLocations());
  const [workType, setWorkType] = useState<WorkType | "any" | null>(null);
  const [remoteScope, setRemoteScope] = useState<RemoteScope | null>(null);
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([]);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [saving, setSaving] = useState(false);

  const steps = getPreferencesSteps(workType);
  const stepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    async function prefill() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const [{ data: profile }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("job_titles").eq("id", user.id).single(),
        supabase.from("job_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      setJobTitles(prefs?.job_titles?.length ? prefs.job_titles : profile?.job_titles ?? []);
      if (prefs?.locations?.length) setLocations(prefs.locations);
      if (prefs?.work_types?.length) {
        const savedType = prefs.work_types[0];
        setWorkType(savedType === "any" ? "any" : (savedType as WorkType));
      }
      if (prefs?.remote_scope) setRemoteScope(prefs.remote_scope);
      if (prefs?.employment_types?.length) setEmploymentTypes(prefs.employment_types);
      if (prefs?.experience_levels?.length) setExperienceLevel(prefs.experience_levels[0]);
      setLoading(false);
    }
    prefill();
  }, []);

  function goNext(fromWorkType?: WorkType | "any" | null) {
    const activeSteps = getPreferencesSteps(fromWorkType !== undefined ? fromWorkType : workType);
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
      <div className="mt-4">
        <OnboardingBackButton
          onClick={stepIndex > 0 ? goBack : undefined}
          href={stepIndex <= 0 ? getPreviousPageHref("preferences") ?? undefined : undefined}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
      <div className="mt-4 lg:mt-6">
        {currentStep === "jobTitle" && (
          <div>
            <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl lg:text-3xl">
              What kind of job would you like next?
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500 lg:text-base">Add one or more job titles.</p>
            <div className="mt-6 lg:mt-10">
              <TagInput value={jobTitles} onChange={setJobTitles} suggestions={JOB_TITLE_SUGGESTIONS} placeholder="e.g. Accountant, Sales Assistant" />
            </div>
            <OnboardingContinueButton onClick={() => goNext()} />
          </div>
        )}

        {currentStep === "locations" && (
          <div>
            <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl lg:text-3xl">
              Where would you like to work?
            </h1>
            <p className="mt-2 text-center text-sm text-slate-500 lg:text-base">Pick specific localities, or stay open to all of Malta.</p>

            <div className="mt-6 lg:mt-10">
              <button
                type="button"
                onClick={() => setLocations((prev) => toggleAllMaltaLocations(prev))}
                aria-pressed={isAllMaltaLocations(locations)}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 lg:rounded-3xl lg:px-6 lg:py-4 lg:text-base",
                  isAllMaltaLocations(locations)
                    ? "border-brand-600 bg-brand-50/60 text-brand-700"
                    : "border-slate-200 text-slate-700 hover:border-brand-300"
                )}
              >
                Anywhere in Malta
              </button>
              <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border border-slate-200 p-3 lg:max-h-64 lg:gap-2 lg:rounded-3xl lg:p-4">
                {MALTA_LOCALITIES.map((locality) => (
                  <button
                    key={locality}
                    type="button"
                    onClick={() => setLocations((prev) => toggleMaltaLocality(prev, locality))}
                    aria-pressed={isMaltaLocalitySelected(locations, locality)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:px-4 lg:py-2 lg:text-sm",
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
      )}
    </div>
  );
}

export default function PreferencesStepPage() {
  return (
    <Suspense fallback={null}>
      <PreferencesStep />
    </Suspense>
  );
}
