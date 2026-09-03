"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { SingleChoiceQuestion } from "@/components/onboarding/single-choice-question";
import { MultiChoiceQuestion } from "@/components/onboarding/multi-choice-question";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { OnboardingBackButton } from "@/components/onboarding/onboarding-back-button";
import { GOALS_STEPS, getPreviousPageHref, type GoalsStepKey } from "@/lib/onboarding-flow";
import type { CareerGoal, MoveTimeline, WorkSituation } from "@/lib/types/database";

const WORK_SITUATIONS: { value: WorkSituation; label: string }[] = [
  { value: "employed", label: "Employed" },
  { value: "self_employed", label: "Self-employed / freelance" },
  { value: "unemployed", label: "Unemployed" },
  { value: "student", label: "Student / looking for my first job" },
];

const MOVE_TIMELINES: { value: MoveTimeline; label: string }[] = [
  { value: "asap", label: "As soon as possible" },
  { value: "within_1_3_months", label: "Within 1–3 months" },
  { value: "within_3_6_months", label: "Within 3–6 months" },
  { value: "exploring", label: "Just exploring" },
];

const CAREER_GOALS: { value: CareerGoal; label: string }[] = [
  { value: "better_salary", label: "Better salary" },
  { value: "career_progression", label: "Career progression" },
  { value: "better_work_life_balance", label: "Better work-life balance" },
  { value: "more_flexibility", label: "More flexibility" },
  { value: "role_in_field", label: "A role in my field" },
  { value: "career_change", label: "A career change" },
  { value: "first_job", label: "First job / more experience" },
];

function initialStepIndex(step: string | null): number {
  const idx = GOALS_STEPS.indexOf(step as GoalsStepKey);
  return idx >= 0 ? idx : 0;
}

function GoalsStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [questionIndex, setQuestionIndex] = useState(() => initialStepIndex(searchParams.get("step")));
  const [workSituation, setWorkSituation] = useState<WorkSituation | null>(null);
  const [moveTimeline, setMoveTimeline] = useState<MoveTimeline | null>(null);
  const [careerGoals, setCareerGoals] = useState<CareerGoal[]>([]);
  const [saving, setSaving] = useState(false);

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("work_situation, move_timeline, career_goals")
        .eq("id", user.id)
        .single();
      if (profile?.work_situation) setWorkSituation(profile.work_situation);
      if (profile?.move_timeline) setMoveTimeline(profile.move_timeline);
      if (profile?.career_goals?.length) setCareerGoals(profile.career_goals);
      setLoading(false);
    }
    prefill();
  }, []);

  function goNext() {
    setQuestionIndex((i) => Math.min(i + 1, GOALS_STEPS.length - 1));
  }

  function goBack() {
    setQuestionIndex((i) => Math.max(i - 1, 0));
  }

  function toggleCareerGoal(goal: CareerGoal) {
    setCareerGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));
  }

  async function handleFinish() {
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
          work_situation: workSituation,
          move_timeline: moveTimeline,
          career_goals: careerGoals,
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

  return (
    <div>
      <OnboardingProgress phaseIndex={1} progress={questionIndex / GOALS_STEPS.length} />
      <div className="mt-4">
        <OnboardingBackButton
          onClick={questionIndex > 0 ? goBack : undefined}
          href={questionIndex === 0 ? getPreviousPageHref("goals") ?? undefined : undefined}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-4 lg:mt-6">
          {questionIndex === 0 && (
            <SingleChoiceQuestion
              question="What's your current work situation?"
              options={WORK_SITUATIONS}
              value={workSituation}
              onSelect={(v) => {
                setWorkSituation(v);
                setTimeout(goNext, 300);
              }}
            />
          )}

          {questionIndex === 1 && (
            <SingleChoiceQuestion
              question="How soon are you looking to move?"
              options={MOVE_TIMELINES}
              value={moveTimeline}
              onSelect={(v) => {
                setMoveTimeline(v);
                setTimeout(goNext, 300);
              }}
            />
          )}

          {questionIndex === 2 && (
            <>
              <MultiChoiceQuestion
                question="What are you hoping for in your next role?"
                helper="Pick as many as apply."
                options={CAREER_GOALS}
                value={careerGoals}
                onToggle={toggleCareerGoal}
              />
              <OnboardingContinueButton onClick={handleFinish} disabled={careerGoals.length === 0} loading={saving} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function GoalsStepPage() {
  return (
    <Suspense fallback={null}>
      <GoalsStep />
    </Suspense>
  );
}
