import { ChoiceButton } from "./choice-button";

/**
 * One centered question with a compact stack of multi-select answers (a
 * tick box per option). The caller renders its own OnboardingContinueButton
 * beneath this — kept separate so the button's disabled/minimum-selection
 * logic stays with the page that knows the rule for that question.
 */
export function MultiChoiceQuestion<T extends string>({
  question,
  helper,
  options,
  value,
  onToggle,
}: {
  question: string;
  helper?: string;
  options: { value: T; label: string }[];
  value: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <h1 className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{question}</h1>
      {helper && <p className="mt-2 text-center text-sm text-slate-500">{helper}</p>}
      <div className="mt-6 space-y-2.5">
        {options.map((option) => (
          <ChoiceButton
            key={option.value}
            label={option.label}
            selected={value.includes(option.value)}
            onClick={() => onToggle(option.value)}
            multi
          />
        ))}
      </div>
    </div>
  );
}
