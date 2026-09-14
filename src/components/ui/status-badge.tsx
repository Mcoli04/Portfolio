import { cn } from "@/lib/utils";
import type { IntegrationStatus } from "@/lib/types/database";

const styles: Record<IntegrationStatus, string> = {
  LIVE: "bg-emerald-100 text-emerald-700",
  DEMO: "bg-amber-100 text-amber-700",
  NOT_CONFIGURED: "bg-slate-100 text-slate-500",
  DISABLED: "bg-slate-100 text-slate-400 line-through",
};

export function StatusBadge({ status, className }: { status: IntegrationStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles[status], className)}>
      {status.replace("_", " ")}
    </span>
  );
}
