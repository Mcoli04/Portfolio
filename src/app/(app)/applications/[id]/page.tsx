import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ApplicationQuestionReview } from "@/components/app/application-question-review";
import type {
  Application,
  ApplicationPendingQuestion,
  Job,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

interface ApplicationRow extends Application {
  jobs: Job | null;
}

export default async function ApplicationReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: application } = await supabase
    .from("applications")
    .select("*, jobs(*)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle<ApplicationRow>();

  if (!application) redirect("/applications");

  const { data: pendingQuestions } = await supabase
    .from("application_pending_questions")
    .select("*")
    .eq("application_id", application.id)
    .order("created_at", { ascending: true })
    .returns<ApplicationPendingQuestion[]>();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-lg font-bold text-slate-900">
            Review questions
          </h1>
          <p className="text-sm text-slate-500">
            {application.jobs?.title ?? "Application"}
            {application.jobs?.company_name
              ? ` at ${application.jobs.company_name}`
              : ""}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        {pendingQuestions?.length ? (
          <>
            <p className="mb-6 text-sm text-slate-600">
              Answer these employer questions before Sqwer retries your application.
            </p>
            <ApplicationQuestionReview
              applicationId={application.id}
              questions={pendingQuestions}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="font-semibold text-slate-900">
              No questions need your attention.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              This application has no unresolved employer questions.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
