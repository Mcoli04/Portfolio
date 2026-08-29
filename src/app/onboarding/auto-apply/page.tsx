"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, GitBranch, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AutoApplyMode } from "@/lib/types/database";

const MODES: { value: AutoApplyMode; title: string; description: string; icon: typeof Zap }[] = [
  {
    value: "auto",
    title: "Auto Apply",
    description: "Swipe right automatically submits supported applications immediately.",
    icon: Zap,
  },
  {
    value: "hybrid",
    title: "Hybrid",
    description: "90%+ matches apply automatically, 70-89% ask you to confirm first, below 70% never applies automatically.",
    icon: GitBranch,
  },
  {
    value: "review",
    title: "Review",
    description: "Swipe right adds the job to a review queue — nothing is submitted until you confirm it.",
    icon: ListChecks,
  },
];

export default function AutoApplyModeStep() {
  const router = useRouter();
  const [selected, setSelected] = useState<AutoApplyMode>("hybrid");
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ auto_apply_mode: selected, onboarding_step: "consent" })
        .eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/onboarding/consent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Choose your Auto Apply mode</h1>
      <p className="mt-1 text-sm text-slate-600">You can change this anytime from Settings.</p>

      <div className="mt-6 space-y-3">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => setSelected(mode.value)}
            className={cn(
              "flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition",
              selected === mode.value ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-600" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", selected === mode.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")}>
              <mode.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{mode.title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{mode.description}</p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={handleContinue} disabled={saving} className="mt-8 w-full">
        {saving ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
