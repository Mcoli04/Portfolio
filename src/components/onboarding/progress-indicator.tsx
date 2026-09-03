import { cn } from "@/lib/utils";

/**
 * Simple "X of Y" progress indicator used across the signup wizard and the
 * onboarding flow — deliberately not a technical route-name stepper, per
 * the redesign's "clear progress indication, simple language" direction.
 */
export function ProgressIndicator({
  step,
  total,
  label,
  className,
}: {
  step: number;
  total: number;
  label?: string;
  className?: string;
}) {
  const percent = Math.min(100, Math.max(0, (step / total) * 100));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>
          {label ?? `Step ${step} of ${total}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
