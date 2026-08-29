import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ApplicationStatusBadge } from "@/components/app/application-status-badge";
import { FileText, ExternalLink } from "lucide-react";
import type { Application, Job } from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface ApplicationRow extends Application {
  jobs: Job | null;
}

export default async function ApplicationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jobs(*)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<ApplicationRow[]>();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-slate-900">Applications</h1>
        <p className="text-sm text-slate-500">Every application you&apos;ve made, tracked from first interest to offer.</p>
      </header>

      <div className="mx-auto max-w-4xl space-y-3 p-6">
        {!applications?.length && (
          <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
            No applications yet — swipe right on a role in Discover to get started.
          </div>
        )}

        {applications?.map((app) => (
          <div key={app.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{app.jobs?.title ?? "Job no longer available"}</p>
                <p className="text-sm text-slate-500">{app.jobs?.company_name}</p>
              </div>
              <ApplicationStatusBadge status={app.status} />
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
              {app.match_score != null && <span>{app.match_score}% match</span>}
              <span>Applied {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : new Date(app.created_at).toLocaleDateString()}</span>
              <span className="capitalize">{app.application_method.replace("_", " ")}</span>
              {app.application_provider && <span className="capitalize">{app.application_provider}</span>}
              {app.external_application_id && <span>Ref: {app.external_application_id}</span>}
            </div>

            {app.error_message && <p className="mt-2 text-xs text-red-600">{app.error_message}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {app.submitted_resume_id && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5" /> Tailored CV submitted
                </span>
              )}
              {app.cover_letter_id && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <FileText className="h-3.5 w-3.5" /> Cover letter submitted
                </span>
              )}
              {app.jobs?.application_url && app.status === "manual_required" && (
                <a
                  href={app.jobs.application_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  Apply on company website <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
