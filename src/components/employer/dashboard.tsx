"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ApplicationStatusBadge } from "@/components/app/application-status-badge";
import { PostJobForm } from "./post-job-form";
import type { Application, ApplicationStatus, Company, Job, Profile } from "@/lib/types/database";

interface EmployerApplication extends Application {
  jobs: Pick<Job, "title"> | null;
}

const STATUS_OPTIONS: ApplicationStatus[] = ["interested", "interview", "offer", "rejected"];

export function EmployerDashboard({
  company,
  jobs,
  applications,
}: {
  company: Company;
  jobs: Job[];
  applications: EmployerApplication[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [candidates, setCandidates] = useState<Record<string, Profile>>({});

  useEffect(() => {
    async function loadCandidates() {
      if (!applications.length) return;
      const supabase = createClient();
      const ids = Array.from(new Set(applications.map((a) => a.user_id)));
      const { data } = await supabase.from("profiles").select("*").in("id", ids);
      const map: Record<string, Profile> = {};
      (data ?? []).forEach((p: Profile) => (map[p.id] = p));
      setCandidates(map);
    }
    loadCandidates();
  }, [applications]);

  async function updateStatus(applicationId: string, status: ApplicationStatus) {
    const supabase = createClient();
    const { error } = await supabase.from("applications").update({ status }).eq("id", applicationId);
    if (error) toast.error(error.message);
    else {
      toast.success("Status updated.");
      router.refresh();
    }
  }

  async function toggleJobActive(job: Job) {
    const supabase = createClient();
    const { error } = await supabase.from("jobs").update({ active: !job.active }).eq("id", job.id);
    if (error) toast.error(error.message);
    else router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            {company.name}
            {company.verified && <CheckCircle2 className="h-5 w-5 text-brand-600" />}
          </h1>
          <p className="text-sm text-slate-500">{company.verified ? "Verified employer" : "Pending verification by an admin"}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} size="sm">
          <Plus className="h-4 w-4" /> Post a job
        </Button>
      </div>

      {showForm && <PostJobForm companyId={company.id} companyName={company.name} onPosted={() => { setShowForm(false); router.refresh(); }} />}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Your job postings</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {!jobs.length && <p className="py-4 text-sm text-slate-400">No jobs posted yet.</p>}
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{job.title}</p>
                <p className="text-xs text-slate-400">{job.locality ?? job.location} · {job.employment_type}</p>
              </div>
              <button
                onClick={() => toggleJobActive(job)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${job.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
              >
                {job.active ? "Active" : "Closed"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Applications received</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {!applications.length && <p className="py-4 text-sm text-slate-400">No applications yet.</p>}
          {applications.map((app) => {
            const candidate = candidates[app.user_id];
            return (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{candidate?.full_name ?? candidate?.email ?? "Candidate"}</p>
                  <p className="text-xs text-slate-400">
                    {app.jobs?.title} · {app.match_score != null ? `${app.match_score}% match` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ApplicationStatusBadge status={app.status} />
                  <select
                    value={app.status}
                    onChange={(e) => updateStatus(app.id, e.target.value as ApplicationStatus)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
