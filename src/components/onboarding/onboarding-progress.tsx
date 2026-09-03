import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_PHASES = ["Profile", "Goals", "Preferences", "Setup", "Ready"];

/**
 * Thin segmented progress tracker shown at the top of every onboarding
 * screen — a handful of short named sections (not a single giant bar), with
 * the active section's fill reflecting progress through that section's own
 * questions and completed sections marked with a check.
 */
export function OnboardingProgress({
  phaseIndex,
  progress = 0,
  phases = DEFAULT_PHASES,
}: {
  /** Index (0-based) of the current phase within `phases`. */
  phaseIndex: number;
  /** Fraction (0-1) of the current phase's questions answered so far. */
  progress?: number;
  phases?: string[];
}) {
  const clampedProgress = Math.min(1, Math.max(0, progress));

  return (
    <div>
      <div className="flex items-center gap-1.5 lg:gap-2">
        {phases.map((label, i) => {
          const completed = i < phaseIndex;
          const current = i === phaseIndex;
          return (
            <div key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 lg:h-2">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
                style={{ width: completed ? "100%" : current ? `${clampedProgress * 100}%` : "0%" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-start justify-between lg:mt-2">
        {phases.map((label, i) => {
          const completed = i < phaseIndex;
          const current = i === phaseIndex;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-0.5">
              {completed && <Check className="h-2.5 w-2.5 text-brand-600 lg:h-3 lg:w-3" strokeWidth={3} />}
              <span
                className={cn(
                  "text-center text-[10px] font-medium leading-none lg:text-xs",
                  current ? "text-brand-700" : completed ? "text-slate-500" : "text-slate-300"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
