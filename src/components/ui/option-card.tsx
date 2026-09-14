import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Large, tappable selectable card used throughout onboarding wherever the
 * user is picking one option from a short list (work preference, how
 * Sqwer should help apply, etc.) — friendlier and easier to tap on mobile
 * than a row of radio buttons.
 */
export function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
  badge,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        selected
          ? "border-brand-600 bg-brand-50/60 shadow-sm"
          : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/20",
        className
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                selected ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
              )}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <span className="font-semibold text-slate-900">{title}</span>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {badge}
          </span>
        )}
      </div>
      {description && <p className="text-sm leading-relaxed text-slate-600">{description}</p>}
    </button>
  );
}
