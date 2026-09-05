import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const body = await req.json();
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

  for (const question of pendingQuestions ?? []) {
    const rawAnswer = answers[question.field_id];

    if (question.field_type === "file" || question.field_type === "boolean") {
      continue;
    }

    if (question.required && (typeof rawAnswer !== "string" || !rawAnswer.trim())) {
      return NextResponse.json(
        { error: `Answer required for ${question.field_id}` },
        { status: 400 }
      );
    }

    if (question.field_type === "select" && typeof rawAnswer === "string" && rawAnswer.trim()) {
      const options = Array.isArray(question.options) ? question.options : [];
      const valid = options.some(
        (option: { value?: string }) => option.value === rawAnswer
      );

      if (!valid) {
        return NextResponse.json(
          { error: `Invalid option for ${question.field_id}` },
          { status: 400 }
        );
      }
    }
  }

  for (const question of pendingQuestions ?? []) {
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

  await supabase.from("application_events").insert({
    application_id: application.id,
    event_type: "APPLICATION_QUEUED",
    metadata: {
      reason: "user_answers_saved",
      answeredFieldIds: Object.keys(answers),
    },
  });

  return NextResponse.json({
    status: "queued",
    applicationId: application.id,
  });
}
