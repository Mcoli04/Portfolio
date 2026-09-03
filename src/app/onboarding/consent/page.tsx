"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Briefcase, Loader2, MapPin, Sliders, Euro, PartyPopper } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingContinueButton } from "@/components/onboarding/onboarding-continue-button";
import { isAllMaltaLocations } from "@/lib/malta-locations";

interface SummaryData {
  jobTitles: string[];
  locations: string[];
  workTypes: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
}

const WORK_TYPE_LABELS: Record<string, string> = {
  any: "Flexible",
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
};

function formatLocations(locations: string[]): string {
  if (isAllMaltaLocations(locations)) return "Anywhere in Malta";
  if (locations.length === 0) return "Not set yet";
  if (locations.length <= 3) return locations.join(", ");
  return `${locations.slice(0, 3).join(", ")} +${locations.length - 3} more`;
}

function formatSalary(min: number | null, max: number | null, currency: string): string | null {
  if (min == null && max == null) return null;
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  if (min != null && max != null) return `${symbol}${min.toLocaleString()} – ${symbol}${max.toLocaleString()}`;
  if (min != null) return `From ${symbol}${min.toLocaleString()}`;
  return `Up to ${symbol}${max!.toLocaleString()}`;
}

export default function ConsentStep() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prefs } = await supabase.from("job_preferences").select("*").eq("user_id", user.id).maybeSingle();
      setSummary({
        jobTitles: prefs?.job_titles ?? [],
        locations: prefs?.locations ?? [],
        workTypes: prefs?.work_types ?? ["any"],
        salaryMin: prefs?.salary_min ?? null,
        salaryMax: prefs?.salary_max ?? null,
        salaryCurrency: prefs?.salary_currency ?? "EUR",
      });
      setLoading(false);
    }
    load();
  }, []);

  async function handleFinish() {
    if (!agreed) return;
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
          auto_apply_authorized: true,
          auto_apply_authorized_at: new Date().toISOString(),
          onboarding_step: "complete",
          onboarding_completed: true,
        })
        .eq("id", user.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("You're all set — let's find your next role.");
      router.push("/discover");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !summary) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const salaryText = formatSalary(summary.salaryMin, summary.salaryMax, summary.salaryCurrency);

  return (
    <div>
      <OnboardingProgress phaseIndex={4} progress={1} />

      <div className="mt-8 flex justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <PartyPopper className="h-6 w-6" />
        </div>
      </div>
      <h1 className="mt-4 text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">You&apos;re ready</h1>
      <p className="mt-1.5 text-center text-sm text-slate-500">Here&apos;s what we&apos;ll use to find your matches.</p>

      <div className="mt-5 space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <SummaryRow icon={Briefcase} label="Jobs" value={summary.jobTitles.length ? summary.jobTitles.join(", ") : "Open to anything"} />
        <SummaryRow icon={MapPin} label="Locations" value={formatLocations(summary.locations)} />
        <SummaryRow icon={Sliders} label="Work style" value={summary.workTypes.map((w) => WORK_TYPE_LABELS[w] ?? w).join(", ")} />
        {salaryText && <SummaryRow icon={Euro} label="Salary" value={salaryText} />}
      </div>

      <p className="mt-5 text-sm leading-relaxed text-slate-600">
        When you swipe right on a job, Sqwer may use the information you&apos;ve provided to prepare and submit that
        application. We&apos;ll never invent qualifications or experience for you.
      </p>

      <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          I understand and want Sqwer to help me apply to jobs I approve.
        </span>
      </label>

      <OnboardingContinueButton
        onClick={handleFinish}
        disabled={!agreed}
        loading={saving}
        label="Show me my jobs"
        loadingLabel="Finishing setup..."
      />

      <p className="mt-4 text-center text-xs text-slate-400">
        Your profile is private. Employers only receive your details when you apply.
      </p>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}
