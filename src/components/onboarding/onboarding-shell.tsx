import Link from "next/link";
import { ProgressIndicator } from "./progress-indicator";

/**
 * Shared visual shell for every onboarding screen: brand mark, progress
 * indicator, and a single centered rounded card holding one step's content.
 * Used by src/app/onboarding/layout.tsx so every step looks and feels the
 * same without each page rebuilding the chrome around it.
 */
export function OnboardingShell({
  step,
  total,
  progressLabel,
  children,
}: {
  step: number;
  total: number;
  progressLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">S</span>
          Sqwer
        </Link>
        <ProgressIndicator step={step} total={total} label={progressLabel} className="mb-6" />
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </main>
  );
}
