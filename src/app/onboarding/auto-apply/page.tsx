"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, MousePointerClick, Zap as ZapIcon, Gauge, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OptionCard } from "@/components/ui/option-card";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { OnboardingBackButton } from "@/components/onboarding/onboarding-back-button";
import { getPreviousPageHref } from "@/lib/onboarding-flow";
import type { AutoApplyMode } from "@/lib/types/database";

const PRIMARY_MODES: { value: AutoApplyMode; title: string; description: string; icon: typeof MousePointerClick; badge?: string }[] = [
  {
    value: "review",
    title: "I choose every job",
    description: "Swipe right and we'll prepare the application for you.",
    icon: MousePointerClick,
    badge: "Recommended",
  },
  {
    value: "hybrid",
    title: "Help me apply faster",
    description: "Sqwer can fill repetitive application details, but you'll stay in control.",
    icon: Gauge,
  },
];

const ADVANCED_MODE: { value: AutoApplyMode; title: string; description: string; icon: typeof ZapIcon } = {
  value: "auto",
  title: "Apply automatically",
  description: "Sqwer applies right away to your strongest matches, without asking first each time.",
  icon: ZapIcon,
};

export default function AutoApplyModeStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AutoApplyMode>("review");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      const { data: profile } = await supabase.from("profiles").select("auto_apply_mode").eq("id", user.id).single();
      if (profile?.auto_apply_mode) {
        setSelected(profile.auto_apply_mode);
        if (profile.auto_apply_mode === "auto") setShowAdvanced(true);
      }
      setLoading(false);
    }
    prefill();
  }, []);

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
      <OnboardingProgress phaseIndex={3} progress={1} />
      <div className="mt-4">
        <OnboardingBackButton href={getPreviousPageHref("autoApply") ?? undefined} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
      <div className="mt-4 lg:mt-6">
        <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl lg:text-3xl">
          How would you like Sqwer to help you apply?
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 lg:text-base">You can change this anytime from Settings.</p>

        <div className="mt-6 space-y-3 lg:mt-10 lg:space-y-4">
          {PRIMARY_MODES.map((mode) => (
            <OptionCard
              key={mode.value}
              selected={selected === mode.value}
              onClick={() => setSelected(mode.value)}
              icon={mode.icon}
              title={mode.title}
              description={mode.description}
              badge={mode.badge}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-5 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700 lg:text-base"
          aria-expanded={showAdvanced}
        >
          Advanced options
          <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </button>

        {showAdvanced && (
          <div className="mt-3">
            <OptionCard
              selected={selected === ADVANCED_MODE.value}
              onClick={() => setSelected(ADVANCED_MODE.value)}
              icon={ADVANCED_MODE.icon}
              title={ADVANCED_MODE.title}
              description={ADVANCED_MODE.description}
            />
          </div>
        )}

        <OnboardingContinueButton onClick={handleContinue} loading={saving} />
      </div>
      )}
    </div>
  );
}
