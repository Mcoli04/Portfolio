import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/status-badge";
import { JobSourceToggle } from "@/components/admin/job-source-toggle";
import { RetryApplicationButton } from "@/components/admin/retry-application-button";
import type { Application, IntegrationStatus, Job } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface AdminApplicationRow extends Application {
  jobs: Pick<Job, "title" | "company_name"> | null;
}

export default async function AdminDashboardPage() {
  const supabase = createClient();

  const [
    { count: userCount },
    { count: jobCount },
    { count: activeJobCount },
    { count: companyCount },
    { count: applicationCount },
    { count: submittedCount },
    { count: failedCount },
    { count: manualCount },
    { count: duplicateCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("status", "manual_required"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).not("canonical_job_id", "is", null),
  ]);

  const { data: jobSources } = await supabase.from("job_sources").select("*").order("name");
  const { data: applicationProviders } = await supabase.from("application_providers").select("*").order("name");
  const { data: queueApplications } = await supabase
    .from("applications")
    .select("*, jobs(title, company_name)")
    .in("status", ["queued", "applying", "failed"])
    .order("updated_at", { ascending: false })
    .limit(20)
    .returns<AdminApplicationRow[]>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin overview</h1>
        <p className="text-sm text-slate-500">Platform-wide health across users, jobs, and applications.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Users" value={userCount ?? 0} />
        <StatCard label="Jobs (active / total)" value={`${activeJobCount ?? 0} / ${jobCount ?? 0}`} />
        <StatCard label="Companies" value={companyCount ?? 0} />
        <StatCard label="Applications" value={applicationCount ?? 0} />
        <StatCard label="Submitted" value={submittedCount ?? 0} tone="success" />
        <StatCard label="Failed" value={failedCount ?? 0} tone="danger" />
        <StatCard label="Manual required" value={manualCount ?? 0} tone="warning" />
        <StatCard label="Deduplicated jobs" value={duplicateCount ?? 0} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Job sources</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {jobSources?.map((source) => (
            <div key={source.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-900">{source.name}</p>
                <p className="text-xs text-slate-400">{source.kind} · last synced {source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : "never"}</p>
                {source.last_error && <p className="text-xs text-red-500">{source.last_error}</p>}
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={source.status as IntegrationStatus} />
                <JobSourceToggle sourceKey={source.key} enabled={source.enabled} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Application providers</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {applicationProviders?.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-900">{provider.name}</p>
                <p className="text-xs text-slate-400">{provider.kind}</p>
              </div>
              <StatusBadge status={provider.status as IntegrationStatus} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Queue &amp; recent failures</h2>
        <div className="mt-4 divide-y divide-slate-100">
          {!queueApplications?.length && <p className="py-4 text-sm text-slate-400">Nothing queued or failing right now.</p>}
          {queueApplications?.map((app) => (
            <div key={app.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-900">{app.jobs?.title ?? "Unknown job"}</p>
                <p className="text-xs text-slate-400">
                  {app.jobs?.company_name} · {app.status} {app.error_message ? `— ${app.error_message}` : ""}
                </p>
              </div>
              {app.status === "failed" && <RetryApplicationButton applicationId={app.id} />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "danger" | "warning" }) {
  const toneClass =
    tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
