"use client";

import { useState } from "react";
import { Eye, EyeOff, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASSWORD_REQUIREMENTS } from "@/lib/validation/auth";

/** Password input with a show/hide toggle and, optionally, a live requirements checklist underneath. */
export function PasswordField({
  value,
  onChange,
  autoComplete = "new-password",
  placeholder,
  showRequirements = false,
  id,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  showRequirements?: boolean;
  id?: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 pr-12 text-base outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-full"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </div>

      {showRequirements && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {PASSWORD_REQUIREMENTS.map((requirement) => {
            const met = requirement.test(value);
            return (
              <li key={requirement.id} className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                    met ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                  )}
                >
                  {met && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
                <span className={met ? "text-emerald-700" : "text-slate-500"}>{requirement.label}</span>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
