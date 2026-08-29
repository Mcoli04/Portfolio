"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function ConsentStep() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

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

  return (
    <div>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Authorize automatic applications</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Auto Apply allows this platform to submit job applications using the information and documents in your profile,
        through supported channels only. You&apos;ll always be able to see exactly what was submitted and when, and you
        can turn Auto Apply off at any time from Settings.
      </p>

      <label className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          I authorize automatic job applications on my behalf, using my CV and profile information, through Sqwer.
        </span>
      </label>

      <Button onClick={handleFinish} disabled={!agreed || saving} className="mt-6 w-full">
        {saving ? "Finishing setup..." : "Start discovering jobs"}
      </Button>
    </div>
  );
}
