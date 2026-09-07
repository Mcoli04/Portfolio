"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";

const STEPS = ["CV selected", "CV prepared", "Cover letter prepared", "Application questions prepared", "Submitting..."];

export function ApplyProgressOverlay({ stepsShown }: { stepsShown: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-white/95 p-8 text-center backdrop-blur"
    >
      <p className="text-lg font-bold text-slate-900">Application starting…</p>
      <ul className="mt-6 space-y-3 text-left">
        {STEPS.map((step, i) => {
          const done = i < stepsShown - 1;
          const active = i === stepsShown - 1;
          return (
            <li key={step} className="flex items-center gap-2.5 text-sm">
              {done ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : active ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" />
              )}
              <span className={done ? "text-slate-500 line-through" : active ? "text-slate-900 font-medium" : "text-slate-300"}>
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}
