import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateApplicationAnswers } from "@/lib/applications/application-answer-validation";

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

  const savedFieldIds: string[] = [];

  for (const question of questions) {
    if (
      question.field_type !== "text" &&
      question.field_type !== "textarea" &&
      question.field_type !== "select"
    ) {
      continue;
    }

    const rawAnswer = answers[question.field_id];

    if (typeof rawAnswer !== "string" || !rawAnswer.trim()) {
      continue;
    }

    const { error: answerError } = await supabase
      .from("application_pending_questions")
      .update({
        answer_value: rawAnswer.trim(),
        answer_source: "application_only",
        source_answer_library_id: null,
      })
      .eq("id", question.id)
      .eq("application_id", application.id);

    if (answerError) {
      return NextResponse.json(
        { error: "Could not save application answers" },
        { status: 500 }
      );
    }

    savedFieldIds.push(question.field_id);
  }

  const { error: queueError } = await supabase
    .from("applications")
    .update({
      status: "queued",
      manual_required: false,
      error_message: null,
    })
    .eq("id", application.id)
    .eq("user_id", user.id);

  if (queueError) {
    return NextResponse.json(
      { error: "Answers were saved, but the application could not be queued" },
      { status: 500 }
    );
  }

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "APPLICATION_QUEUED",
    metadata: {
      reason: "user_answers_saved",
      answeredFieldIds: savedFieldIds,
    },
  });

  if (eventError) {
    console.error("[application-answers] failed to log APPLICATION_QUEUED", eventError.message);
  }

  return NextResponse.json({
    status: "queued",
    applicationId: application.id,
  });
}
