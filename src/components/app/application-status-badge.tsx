import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/lib/types/database";

const LABELS: Record<ApplicationStatus, string> = {
  interested: "Interested",
  queued: "Queued",
  applying: "Applying",
  submitted: "Submitted",
  failed: "Failed",
  manual_required: "Manual Required",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STYLES: Record<ApplicationStatus, string> = {
  interested: "bg-slate-100 text-slate-600",
  queued: "bg-slate-100 text-slate-600",
  applying: "bg-brand-100 text-brand-700",
  submitted: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  manual_required: "bg-amber-100 text-amber-700",
  interview: "bg-violet-100 text-violet-700",
  offer: "bg-emerald-100 text-emerald-800",
  rejected: "bg-slate-100 text-slate-500",
  withdrawn: "bg-slate-100 text-slate-400",
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", STYLES[status])}>
      {LABELS[status]}
    </span>
  );
}
