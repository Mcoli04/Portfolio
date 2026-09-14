import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateApplicationAnswers } from "@/lib/applications/application-answer-validation";
import { saveApplicationAnswersAndRequeue } from "@/lib/applications/save-application-answers";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id, user_id, status")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (applicationError) {
    return NextResponse.json(
      { error: "Could not load application" },
      { status: 500 }
    );
  }

  if (!application) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 }
    );
  }

  if (application.status !== "manual_required") {
    return NextResponse.json(
      { error: "This application is not awaiting manual answers" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { error: "Request body must contain valid JSON" },
      { status: 400 }
    );
  }

  const answers = body?.answers;

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return NextResponse.json(
      { error: "answers must be an object keyed by field ID" },
      { status: 400 }
    );
  }

  const { data: pendingQuestions, error: pendingQuestionsError } = await supabase
    .from("application_pending_questions")
    .select("*")
    .eq("application_id", application.id);

  if (pendingQuestionsError) {
    return NextResponse.json(
      { error: "Could not load pending questions" },
      { status: 500 }
    );
  }

  const questions = pendingQuestions ?? [];

  const validation = validateApplicationAnswers(questions, answers);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const result = await saveApplicationAnswersAndRequeue(
    supabase,
    application.id,
    validation.savedAnswers ?? []
  );

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    if (result.reason === "not_manual_required") {
      return NextResponse.json(
        { error: "This application is no longer awaiting manual answers" },
        { status: 409 }
      );
    }

    if (result.reason === "unanswered_required_questions") {
      return NextResponse.json(
        { error: "Some required questions still need an answer. Please refresh and try again." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not save application answers and queue the application" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "queued",
    applicationId: application.id,
  });
}
