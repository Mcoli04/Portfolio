import { cn } from "@/lib/utils";

/** Small pill-shaped toggle button used for multi-select groups (employment type, experience level, etc). */
export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 text-slate-600 hover:border-brand-300",
        className
      )}
    >
      {children}
    </button>
  );
}

/** A row of Chip toggles bound to a multi-select string array value. */
export function ChipGroup<T extends string>({
  options,
  value,
  onToggle,
  className,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onToggle: (option: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <Chip key={option.value} active={value.includes(option.value)} onClick={() => onToggle(option.value)}>
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
