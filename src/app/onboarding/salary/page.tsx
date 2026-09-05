"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { OnboardingBackButton } from "@/components/onboarding/onboarding-back-button";
import { getPreviousPageHref } from "@/lib/onboarding-flow";
import { parseSalaryField, validateSalaryRange } from "@/lib/validation/preferences";

export default function SalaryStep() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [saving, setSaving] = useState(false);
  const salaryError = validateSalaryRange(salaryMin, salaryMax);

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
      const { data: prefs } = await supabase
        .from("job_preferences")
        .select("salary_min, salary_max")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prefs?.salary_min != null) setSalaryMin(String(prefs.salary_min));
      if (prefs?.salary_max != null) setSalaryMax(String(prefs.salary_max));
      setLoading(false);
    }
    prefill();
  }, []);

  function handleSkip() {
    setSalaryMin("");
    setSalaryMax("");
  }

  async function handleContinue() {
    if (salaryError) {
      toast.error(salaryError);
      return;
    }
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
          salary_min: parseSalaryField(salaryMin),
          salary_max: parseSalaryField(salaryMax),
          salary_currency: "EUR",
        },
        { onConflict: "user_id" }
      );
      if (error) {
        toast.error(error.message);
        return;
      }

      await supabase.from("profiles").update({ onboarding_step: "auto_apply_mode" }).eq("id", user.id);
      router.push("/onboarding/auto-apply");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <OnboardingProgress phaseIndex={2} progress={1} />
      <div className="mt-4">
        <OnboardingBackButton href={getPreviousPageHref("salary") ?? undefined} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
      <div className="mt-4 lg:mt-6">
        <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl lg:text-3xl">
          What salary are you aiming for?
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500 lg:text-base">Optional — you can skip this if you&apos;re flexible.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-10 lg:gap-4">
          <SalaryInput label="Minimum yearly salary" value={salaryMin} onChange={setSalaryMin} autoFocus />
          <SalaryInput label="Maximum yearly salary" value={salaryMax} onChange={setSalaryMax} />
        </div>
        {salaryError && <p className="mt-2 text-center text-xs text-red-600">{salaryError}</p>}

        <div className="mt-4 text-center">
          <button type="button" onClick={handleSkip} className="text-sm font-medium text-brand-600 hover:underline lg:text-base">
            I&apos;d rather not say
          </button>
        </div>

        <OnboardingContinueButton onClick={handleContinue} disabled={!!salaryError} loading={saving} />
      </div>
      )}
    </div>
  );
}

function SalaryInput({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700 lg:text-base">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base font-medium text-slate-400 lg:text-lg">
          €
        </span>
        <input
          type="number"
          min={0}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full rounded-2xl border border-slate-300 py-3 pl-9 pr-3 text-base outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 lg:rounded-3xl lg:py-4 lg:pl-10 lg:text-lg"
        />
      </div>
    </div>
  );
}
