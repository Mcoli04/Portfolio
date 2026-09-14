"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { AnswerLibraryEntry } from "@/lib/types/database";

const SUGGESTED_QUESTIONS: { key: string; label: string; questionText: string; placeholder: string }[] = [
  { key: "linkedin_url", label: "LinkedIn URL", questionText: "What is your LinkedIn profile URL?", placeholder: "https://linkedin.com/in/yourname" },
  { key: "portfolio_url", label: "Portfolio / website", questionText: "Do you have a portfolio or personal website?", placeholder: "https://yoursite.com" },
  { key: "notice_period", label: "Notice period", questionText: "What is your notice period?", placeholder: "e.g. 1 month" },
  { key: "start_date", label: "Earliest start date", questionText: "What is your earliest possible start date?", placeholder: "e.g. Immediately, or 1 September 2025" },
  { key: "salary_expectation", label: "Salary expectations", questionText: "What are your salary expectations?", placeholder: "e.g. €35,000 - €40,000" },
  { key: "relocation", label: "Willingness to relocate", questionText: "Are you willing to relocate?", placeholder: "e.g. Open to relocating within Malta" },
  { key: "sponsorship_requirement", label: "Sponsorship requirement", questionText: "Will you now or in the future require sponsorship?", placeholder: "e.g. I do not require sponsorship" },
];

interface EditableEntry {
  id: string | null;
  question_key: string;
  question_text: string;
  answer_text: string;
}

function toEditable(entry: AnswerLibraryEntry | undefined, fallbackKey: string, fallbackQuestion: string): EditableEntry {
  return {
    id: entry?.id ?? null,
    question_key: fallbackKey,
    question_text: entry?.question_text ?? fallbackQuestion,
    answer_text: entry?.answer_text ?? "",
  };
}

/**
 * Lets a user save reusable, verified answers to common application
 * questions (spec: Application Answers). Every entry saved here is written
 * with verified:true because the user typed it themselves — that's what
 * makes it eligible for src/lib/ai/answer-questions.ts's answerQuestion()
 * to match against later (not currently wired into application
 * processing — this only populates the library). Nothing here invents an
 * answer: an empty field is simply not saved, leaving that question
 * unanswered for a future manual-review fallback rather than guessed.
 */
export function AnswerLibraryCard({ userId, entries }: { userId: string; entries: AnswerLibraryEntry[] }) {
  const entryByKey = new Map(entries.map((e) => [e.question_key, e]));
  const suggested = SUGGESTED_QUESTIONS.map((q) => ({
    ...q,
    entry: toEditable(entryByKey.get(q.key), q.key, q.questionText),
  }));
  const custom = entries.filter((e) => !SUGGESTED_QUESTIONS.some((q) => q.key === e.question_key));

  const [suggestedValues, setSuggestedValues] = useState<Record<string, string>>(
    Object.fromEntries(suggested.map((s) => [s.key, s.entry.answer_text]))
  );
  const [customEntries, setCustomEntries] = useState<AnswerLibraryEntry[]>(custom);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  async function saveSuggested(key: string, questionText: string) {
    const answerText = suggestedValues[key]?.trim();
    if (!answerText) {
      toast.error("Enter an answer before saving.");
      return;
    }
    setSavingKey(key);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("answer_library").upsert(
        {
          user_id: userId,
          question_key: key,
          question_text: questionText,
          answer_text: answerText,
          answer_type: "text",
          verified: true,
        },
        { onConflict: "user_id,question_key" }
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Saved.");
    } finally {
      setSavingKey(null);
    }
  }

  async function addCustom() {
    const question = newQuestion.trim();
    const answer = newAnswer.trim();
    if (!question || !answer) {
      toast.error("Add both a question and an answer.");
      return;
    }
    setAddingCustom(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("answer_library")
        .insert({
          user_id: userId,
          question_key: `custom_${crypto.randomUUID()}`,
          question_text: question,
          answer_text: answer,
          answer_type: "text",
          verified: true,
        })
        .select()
        .single<AnswerLibraryEntry>();
      if (error || !data) {
        toast.error(error?.message ?? "Could not save that question.");
        return;
      }
      setCustomEntries((prev) => [data, ...prev]);
      setNewQuestion("");
      setNewAnswer("");
      toast.success("Added.");
    } finally {
      setAddingCustom(false);
    }
  }

  async function removeCustom(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("answer_library").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCustomEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Application answers</h2>
      <p className="mt-1 text-xs text-slate-500">
        Save answers you&apos;re happy to reuse across applications. We&apos;ll only use one when it clearly matches a
        real question an employer asks — we never invent an answer, and anything we&apos;re not confident about is
        left for you to complete yourself.
      </p>

      <div className="mt-4 space-y-3">
        {suggested.map((s) => (
          <div key={s.key} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium text-slate-700">{s.label}</label>
              <input
                value={suggestedValues[s.key] ?? ""}
                onChange={(e) => setSuggestedValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                placeholder={s.placeholder}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={() => saveSuggested(s.key, s.questionText)}
              disabled={savingKey === s.key}
              aria-label={`Save ${s.label}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
            >
              {savingKey === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        ))}
      </div>

      {customEntries.length > 0 && (
        <div className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold text-slate-700">Your other answers</h3>
          <div className="mt-2 space-y-2">
            {customEntries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-700">{entry.question_text}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-900">{entry.answer_text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeCustom(entry.id)}
                  aria-label="Remove"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h3 className="text-xs font-semibold text-slate-700">Add another question</h3>
        <div className="mt-2 space-y-2">
          <input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Question, e.g. Do you have a driving licence?"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <input
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            placeholder="Your answer"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <Button onClick={addCustom} disabled={addingCustom} variant="outline" size="sm">
            {addingCustom ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </section>
  );
}
