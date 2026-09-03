"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { SingleChoiceQuestion } from "@/components/onboarding/single-choice-question";
import { MultiChoiceQuestion } from "@/components/onboarding/multi-choice-question";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import type { CareerGoal, MoveTimeline, WorkSituation } from "@/lib/types/database";

const TOTAL_QUESTIONS = 3;

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

export default function GoalsStep() {
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [workSituation, setWorkSituation] = useState<WorkSituation | null>(null);
  const [moveTimeline, setMoveTimeline] = useState<MoveTimeline | null>(null);
  const [careerGoals, setCareerGoals] = useState<CareerGoal[]>([]);
  const [saving, setSaving] = useState(false);

  function goNext() {
    setQuestionIndex((i) => Math.min(i + 1, TOTAL_QUESTIONS - 1));
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
      <OnboardingProgress phaseIndex={1} progress={questionIndex / TOTAL_QUESTIONS} />

      {questionIndex > 0 && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="mt-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className={questionIndex > 0 ? "mt-4" : "mt-8"}>
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
    </div>
  );
}
