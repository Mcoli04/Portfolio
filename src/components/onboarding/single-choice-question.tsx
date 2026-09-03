import { ChoiceButton } from "./choice-button";

/**
 * One centered question with a compact stack of single-select answers.
 * Selecting an option is reported via onSelect immediately — callers decide
 * whether to auto-advance (where the answer is unambiguous) or wait for an
 * explicit Continue (where the answer benefits from a second look).
 */
export function SingleChoiceQuestion<T extends string>({
  question,
  helper,
  options,
  value,
  onSelect,
}: {
  question: string;
  helper?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onSelect: (value: T) => void;
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
            selected={value === option.value}
            onClick={() => onSelect(option.value)}
          />
        ))}
      </div>
    </div>
  );
}
