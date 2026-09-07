"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChoiceButton } from "@/components/onboarding/choice-button";
import type { ApplicationPendingQuestion } from "@/lib/types/database";

export function ApplicationQuestionReview({
  applicationId,
  questions,
}: {
  applicationId: string;
  questions: ApplicationPendingQuestion[];
}) {
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions
        .filter((question) => question.answer_value)
        .map((question) => [question.field_id, question.answer_value as string])
    )
  );

  const [saving, setSaving] = useState(false);

  async function saveAndRetry() {
    setSaving(true);

    try {
      const response = await fetch(`/api/applications/${applicationId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not save answers");
      }

      toast.success("Answers saved. Application queued for retry.");
      router.push("/applications");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save answers"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {questions.map((question) => (
        <div
          key={question.id}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <div className="mb-4">
            <p className="font-semibold text-slate-900">
              {question.question_text}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {question.required ? "Required" : "Optional"}
            </p>
          </div>

          {question.field_type === "select" && question.options ? (
            <div className="space-y-2">
              {question.options.map((option) => (
                <ChoiceButton
                  key={option.value}
                  label={option.label}
                  selected={answers[question.field_id] === option.value}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      [question.field_id]: option.value,
                    }))
                  }
                />
              ))}
            </div>
          ) : question.field_type === "textarea" ? (
            <textarea
              value={answers[question.field_id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [question.field_id]: event.target.value,
                }))
              }
              rows={5}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          ) : question.field_type === "text" ? (
            <input
              type="text"
              value={answers[question.field_id] ?? ""}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [question.field_id]: event.target.value,
                }))
              }
              className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          ) : (
            <p className="text-sm text-amber-700">
              This question must be completed on the employer&apos;s website.
            </p>
          )}
        </div>
      ))}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={saving}
        onClick={saveAndRetry}
      >
        {saving ? "Saving..." : "Save answers & retry"}
      </Button>
    </div>
  );
}
