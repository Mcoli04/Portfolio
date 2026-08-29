import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@/lib/types/database";

const STEPS: { key: OnboardingStep; label: string }[] = [
  { key: "upload_cv", label: "Upload CV" },
  { key: "review_cv", label: "Review" },
  { key: "preferences", label: "Preferences" },
  { key: "auto_apply_mode", label: "Auto Apply" },
  { key: "consent", label: "Authorize" },
];

function stepIndex(step: OnboardingStep): number {
  if (step === "create_account") return -1;
  if (step === "parse_cv") return 0;
  if (step === "complete") return STEPS.length;
  return STEPS.findIndex((s) => s.key === step);
}

export function OnboardingStepper({ currentStep }: { currentStep: OnboardingStep }) {
  const currentIndex = stepIndex(currentStep);

  return (
    <ol className="flex items-center justify-between">
      {STEPS.map((step, i) => (
        <li key={step.key} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                i < currentIndex && "bg-brand-600 text-white",
                i === currentIndex && "bg-brand-600 text-white ring-4 ring-brand-100",
                i > currentIndex && "bg-slate-100 text-slate-400"
              )}
            >
              {i + 1}
            </div>
            <span className={cn("text-[11px] font-medium", i <= currentIndex ? "text-slate-700" : "text-slate-400")}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("mx-2 h-0.5 flex-1", i < currentIndex ? "bg-brand-600" : "bg-slate-100")} />
          )}
        </li>
      ))}
    </ol>
  );
}
