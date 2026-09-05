"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutoApplyMode, Profile } from "@/lib/types/database";

const MODES: { value: AutoApplyMode; title: string; description: string }[] = [
  { value: "auto", title: "Auto Apply", description: "Swipe right always submits automatically." },
  { value: "hybrid", title: "Hybrid", description: "90%+ auto-applies, 70-89% asks first, below 70% never automatic." },
  { value: "review", title: "Review", description: "Every swipe right goes to a review queue you confirm." },
];

export function AutoApplySettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [mode, setMode] = useState<AutoApplyMode>(profile.auto_apply_mode);
  const [authorized, setAuthorized] = useState(profile.auto_apply_authorized);
  const [saving, setSaving] = useState(false);

  async function save(nextMode: AutoApplyMode, nextAuthorized: boolean) {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          auto_apply_mode: nextMode,
          auto_apply_authorized: nextAuthorized,
          auto_apply_authorized_at: nextAuthorized ? new Date().toISOString() : null,
        })
        .eq("id", profile.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Auto Apply settings updated.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Auto Apply</h2>
      <div className="mt-4 space-y-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={cn(
              "block w-full rounded-xl border p-3 text-left text-sm transition",
              mode === m.value ? "border-brand-600 bg-brand-50/50" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <span className="font-medium text-slate-900">{m.title}</span>
            <p className="text-xs text-slate-500">{m.description}</p>
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          I authorize automatic job applications on my behalf. Unchecking this immediately stops all automatic
          submissions — every swipe right will require manual completion until re-authorized.
        </span>
      </label>

      <Button onClick={() => save(mode, authorized)} disabled={saving} className="mt-4">
        {saving ? "Saving..." : "Save"}
      </Button>
    </section>
  );
}
