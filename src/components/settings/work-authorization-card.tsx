"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { WORK_AUTHORIZATION_OPTIONS, workAuthorizationAnswerText } from "@/lib/applications/work-authorization";
import type { Profile, WorkAuthorization } from "@/lib/types/database";

/**
 * Explicit, editable-anytime work authorization answer. Never inferred
 * from the CV, location, or anything else — only ever set here or during
 * onboarding, by the user picking one of these options directly.
 */
export function WorkAuthorizationCard({ profile }: { profile: Profile }) {
  const [value, setValue] = useState<WorkAuthorization | null>(profile.work_authorization);
  const [saving, setSaving] = useState(false);

  async function save(next: WorkAuthorization) {
    setValue(next);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("profiles").update({ work_authorization: next }).eq("id", profile.id);
      if (error) {
        toast.error(error.message);
        return;
      }

      // Same rule as onboarding: only a real answer updates the reusable
      // answer library. "Prefer not to say" leaves any existing entry as
      // it was rather than fabricating a canned response.
      const answerText = workAuthorizationAnswerText(next);
      if (answerText) {
        await supabase.from("answer_library").upsert(
          {
            user_id: profile.id,
            question_key: "work_authorization",
            question_text: "Are you authorized to work in this location?",
            answer_text: answerText,
            answer_type: "text",
            verified: true,
          },
          { onConflict: "user_id,question_key" }
        );
      }
      toast.success("Work authorization updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Work authorization</h2>
      <p className="mt-1 text-xs text-slate-500">
        We only use this to route applications that ask about work authorization — we never guess it from your CV or
        location.
      </p>
      <div className="mt-4 space-y-2">
        {WORK_AUTHORIZATION_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={saving}
            onClick={() => save(option.value)}
            className={cn(
              "block w-full rounded-xl border p-3 text-left text-sm transition disabled:opacity-50",
              value === option.value ? "border-brand-600 bg-brand-50/50 text-slate-900" : "border-slate-200 text-slate-700 hover:border-slate-300"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
