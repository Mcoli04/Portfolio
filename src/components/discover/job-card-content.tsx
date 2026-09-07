import { MapPin, Euro } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { JobWithMatch } from "@/lib/types/database";

function matchColor(score: number): string {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 65) return "bg-brand-500";
  return "bg-amber-500";
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  internship: "Internship",
};

export function JobCardContent({ job, compact = false }: { job: JobWithMatch; compact?: boolean }) {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between">
        <span className={`inline-flex items-center gap-1.5 rounded-full ${matchColor(job.match_score)} px-3 py-1 text-xs font-bold text-white`}>
          {job.match_score}% MATCH
        </span>
        {job.source === "demo" && <StatusBadge status="DEMO" />}
      </div>

      <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-900">{job.title}</h2>
      <p className="mt-1 text-base font-medium text-slate-600">{job.company_name}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" /> {job.locality ?? job.location ?? "Malta"}
        </span>
        {job.salary_min && job.salary_max && (
          <span className="flex items-center gap-1">
            <Euro className="h-3.5 w-3.5" />
            {job.salary_min.toLocaleString()} – {job.salary_max.toLocaleString()}
          </span>
        )}
        <span>
          {job.employment_type ? EMPLOYMENT_LABELS[job.employment_type] : ""}
          {job.employment_type && job.remote_type ? " · " : ""}
          {job.remote_type ? job.remote_type[0].toUpperCase() + job.remote_type.slice(1) : ""}
        </span>
      </div>

      {job.skills?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {job.skills.slice(0, compact ? 4 : 8).map((skill) => (
            <span key={skill} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {skill}
            </span>
          ))}
        </div>
      )}

      <p className={`mt-4 text-sm leading-relaxed text-slate-600 ${compact ? "line-clamp-3" : "line-clamp-6"}`}>
        {job.description}
      </p>

      {job.match_reasons?.length > 0 && (
        <div className="mt-auto rounded-xl bg-brand-50/70 p-3 pt-3">
          <p className="text-xs font-semibold text-brand-700">Why this matches you</p>
          <p className="mt-1 text-xs leading-relaxed text-brand-900/80">{job.match_reasons[0]}</p>
        </div>
      )}
    </div>
  );
}
