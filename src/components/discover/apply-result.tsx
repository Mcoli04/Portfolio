"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobWithMatch } from "@/lib/types/database";

export type ApplyResultKind = "submitted" | "failed" | "manual_required" | "confirm";

export function ApplyResultOverlay({
  kind,
  job,
  message,
  onRetry,
  onManual,
  onPass,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  kind: ApplyResultKind;
  job: JobWithMatch;
  message?: string;
  onRetry?: () => void;
  onManual?: () => void;
  onPass?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl bg-white p-8 text-center"
    >
      {kind === "submitted" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="mt-4 text-lg font-bold text-slate-900">Application sent</p>
          <p className="mt-1 text-sm font-medium text-slate-700">{job.title}</p>
          <p className="text-sm text-slate-500">{job.company_name}</p>
          <p className="mt-3 text-xs text-slate-400">Application submitted successfully.</p>
        </>
      )}

      {kind === "failed" && (
        <>
          <XCircle className="h-12 w-12 text-red-500" />
          <p className="mt-4 text-lg font-bold text-slate-900">Application couldn&apos;t be completed</p>
          <p className="mt-1 text-sm text-slate-500">{message ?? "Something went wrong while submitting."}</p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={onRetry} className="w-full">
              Retry
            </Button>
            <Button onClick={onManual} variant="outline" className="w-full">
              Apply manually
            </Button>
            <Button onClick={onPass} variant="ghost" className="w-full">
              Pass
            </Button>
          </div>
        </>
      )}

      {kind === "manual_required" && (
        <>
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <p className="mt-4 text-lg font-bold text-slate-900">Manual application required</p>
          <p className="mt-1 text-sm text-slate-500">{message ?? "Automatic application isn't supported for this job yet."}</p>
          <div className="mt-6 flex w-full flex-col gap-2">
            {job.application_url && (
              <a href={job.application_url} target="_blank" rel="noreferrer">
                <Button className="w-full">
                  Apply on company website <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            )}
            <Button onClick={onManual} variant="outline" className="w-full">
              Mark as applied
            </Button>
            <Button onClick={onDismiss} variant="ghost" className="w-full">
              Continue
            </Button>
          </div>
        </>
      )}

      {kind === "confirm" && (
        <>
          <p className="text-lg font-bold text-slate-900">Confirm this application?</p>
          <p className="mt-1 text-sm text-slate-500">
            {job.title} at {job.company_name} is a {job.match_score}% match. Your Hybrid Auto Apply setting asks for
            confirmation on matches in this range.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2">
            <Button onClick={onConfirm} className="w-full">
              Confirm and apply
            </Button>
            <Button onClick={onCancel} variant="ghost" className="w-full">
              Cancel
            </Button>
          </div>
        </>
      )}
    </motion.div>
  );
}
