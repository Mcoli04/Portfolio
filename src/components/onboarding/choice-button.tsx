import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact full-width selectable button used for every onboarding question —
 * single-choice (radio-like, check on the right when selected) or
 * multi-choice (a tick box on the left). Shorter and plainer than a card:
 * one line of text, an obvious active state, fast tap feedback.
 */
export function ChoiceButton({
  label,
  selected,
  onClick,
  multi = false,
  className,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        selected
          ? "border-brand-600 bg-brand-50 text-brand-700"
          : "border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-slate-50",
        className
      )}
    >
      {multi && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
            selected ? "border-brand-600 bg-brand-600" : "border-slate-300"
          )}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </span>
      )}
      <span className="flex-1">{label}</span>
      {!multi && selected && <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={3} />}
    </button>
  );
}
