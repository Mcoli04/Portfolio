import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, AnswerLibraryEntry, Job, Profile, ResumeVersion } from "@/lib/types/database";
import { tailorCvForJob } from "@/lib/ai/cv-tailoring";
import { generateCoverLetter } from "@/lib/ai/cover-letter";
import { answerQuestion } from "@/lib/ai/answer-questions";
import { normalizeAnswerForField } from "./answer-normalization";
import { isIdentityRole, isDocumentRole, resolveIdentityFieldValue, hasDocumentData } from "./identity-fields";
import { syncPendingQuestions } from "./pending-questions";
import { getApplicationProvider } from "./provider-registry";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import type { ApplicationProvider, CandidateApplicationData, FormField } from "./types";

export type EngineOutcome =
  | { status: "submitted"; externalApplicationId?: string; provider: string }
  | { status: "manual_required"; reason: string }
  | { status: "failed"; reason: string };

interface RunContext {
  supabase: SupabaseClient;
  application: Application;
  job: Job;
  profile: Profile;
  resumeVersion: ResumeVersion | null;
  /**
   * Test-only override for provider selection — bypasses selectProvider(job)
   * so tests can exercise getApplicationForm()/answerQuestion() wiring
   * against a fake provider without needing a real, live one. Production
   * call sites (api/applications/apply/route.ts, application-worker.ts)
   * never set this, so selectProvider(job) governs every real request
   * exactly as before.
   */
  provider?: ApplicationProvider;
}

async function logEvent(
  supabase: SupabaseClient,
  applicationId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("application_events").insert({ application_id: applicationId, event_type: eventType, metadata });
}

/**
 * Decides which channel handles a job, following the decision tree in
 * spec §16: demo jobs always go to the internal sandbox; otherwise API →
 * configured ATS → permitted browser automation → authorised email →
 * manual. A provider that isn't actually LIVE is skipped rather than used,
 * so the engine never fabricates a submission through a fake channel.
 *
 * Browser automation is additionally gated on
 * BrowserAutomationApplicationProvider.isDomainAllowed(): a job having an
 * application_url is not by itself enough to attempt automation — that
 * would mean every real job with no verified submission provider (e.g. a
 * freshly-ingested Greenhouse job) launches a real browser on a swipe. Only
 * an employer/domain someone has explicitly reviewed and allowlisted
 * (BROWSER_AUTOMATION_ALLOWED_DOMAINS) reaches submitLive(); everything
 * else with no other channel returns null here and resolves to
 * manual_required with that job's real application_url, without ever
 * touching Playwright.
 */
export function selectProvider(job: Job): ApplicationProvider | null {
  if (job.source === "demo") {
    return getApplicationProvider("internal");
  }

  if (job.application_method === "api" && job.application_provider) {
    const provider = getApplicationProvider(job.application_provider);
    if (provider && provider.getStatus() === "LIVE") return provider;
  }

  if (job.application_method === "ats" && job.application_provider) {
    const provider = getApplicationProvider(job.application_provider);
    if (provider && provider.getStatus() === "LIVE") return provider;
  }

  if (job.application_method === "internal") {
    const provider = getApplicationProvider("employer_integration");
    if (provider && provider.getStatus() === "LIVE") return provider;
  }

  if (job.application_url && BrowserAutomationApplicationProvider.isDomainAllowed(job.application_url)) {
    return getApplicationProvider("browser_automation");
  }

  if (job.application_method === "email" && job.application_email) {
    const provider = getApplicationProvider("email");
    if (provider && provider.getStatus() === "LIVE") return provider;
  }

  return null;
}

/**
 * Orchestrates one application end to end (spec §16, §22, §35). Every stage
 * writes an application_events row so the tracker and admin dashboard have
 * a full audit trail, and the applications row is only ever marked
 * "submitted" once the chosen provider actually confirmed it.
 */
export class ApplicationAutomationEngine {
  async run(ctx: RunContext): Promise<EngineOutcome> {
    const { supabase, application, job, profile, resumeVersion } = ctx;

    if (!profile.auto_apply_authorized) {
      await logEvent(supabase, application.id, "MANUAL_ACTION_REQUIRED", { reason: "auto_apply_not_authorized" });
      return { status: "manual_required", reason: "Auto Apply has not been authorized for this account." };
    }

    await logEvent(supabase, application.id, "APPLICATION_STARTED", { jobId: job.id });

    if (!resumeVersion) {
      await this.markManual(supabase, application, "No parsed CV is available to submit.", { clearChannel: true });
      return { status: "manual_required", reason: "No CV on file." };
    }
    await logEvent(supabase, application.id, "CV_SELECTED", { resumeVersionId: resumeVersion.id });

    const provider = ctx.provider ?? selectProvider(job);
    if (!provider) {
      await this.markManual(supabase, application, "No supported automatic application channel for this job.", {
        clearChannel: true,
      });
      return { status: "manual_required", reason: "No automatic application channel available." };
    }

    const baseResumeText = resumeVersion.parsed_data ? summarizeParsedCv(resumeVersion.parsed_data as never, profile) : profileToResumeText(profile);

    const tailored = await tailorCvForJob(baseResumeText, resumeVersion.parsed_data, job);
    const { data: submittedResumeDoc } = await supabase
      .from("submitted_documents")
      .insert({
        application_id: application.id,
        user_id: profile.id,
        doc_type: "resume",
        content_text: tailored.text,
        tailored: tailored.tailored,
      })
      .select()
      .single();
    await logEvent(supabase, application.id, "CV_TAILORED", { tailored: tailored.tailored });

    const coverLetter = await generateCoverLetter(profile, job);
    const { data: coverLetterDoc } = await supabase
      .from("submitted_documents")
      .insert({
        application_id: application.id,
        user_id: profile.id,
        doc_type: "cover_letter",
        content_text: coverLetter.text,
        tailored: coverLetter.aiAssisted,
      })
      .select()
      .single();
    await logEvent(supabase, application.id, "COVER_LETTER_CREATED", { aiAssisted: coverLetter.aiAssisted });

    const answerResolution = await this.resolveApplicationAnswers(supabase, application, job, profile, provider, {
      resumeText: tailored.text,
      coverLetterText: coverLetter.text,
    });
    if (answerResolution.blocked) return answerResolution.outcome;

    const candidate: CandidateApplicationData = {
      fullName: profile.full_name ?? profile.email,
      firstName: profile.first_name ?? undefined,
      lastName: profile.last_name ?? undefined,
      email: profile.email,
      phone: profile.phone ?? undefined,
      resumeText: tailored.text,
      resumeFileName: resumeVersion.file_name,
      coverLetterText: coverLetter.text,
      answers: answerResolution.answers,
    };

    await supabase
      .from("applications")
      .update({
        status: "applying",
        submitted_resume_id: submittedResumeDoc?.id,
        cover_letter_id: coverLetterDoc?.id,
        application_method: job.application_method,
        application_provider: provider.key,
      })
      .eq("id", application.id);

    const result = await provider.submitApplication(job, candidate);

    if (result.success) {
      await supabase
        .from("applications")
        .update({
          status: "submitted",
          external_application_id: result.externalApplicationId,
          submitted_at: new Date().toISOString(),
          manual_required: false,
          error_message: null,
        })
        .eq("id", application.id);
      await logEvent(supabase, application.id, "APPLICATION_SUBMITTED", { provider: provider.key, externalApplicationId: result.externalApplicationId });

      const verified = result.externalApplicationId ? await provider.verifySubmission(result.externalApplicationId) : true;
      if (verified) {
        await logEvent(supabase, application.id, "APPLICATION_CONFIRMED", { provider: provider.key });
      }

      await supabase.from("notifications").insert({
        user_id: profile.id,
        type: "application_submitted",
        title: "Application submitted",
        body: `Your application for ${job.title} at ${job.company_name} was submitted successfully.`,
        metadata: { jobId: job.id, applicationId: application.id },
      });

      return { status: "submitted", externalApplicationId: result.externalApplicationId, provider: provider.key };
    }

    if (result.manualRequired) {
      await this.markManual(supabase, application, result.errorMessage ?? "Manual completion required.");
      return { status: "manual_required", reason: result.errorMessage ?? "Manual completion required." };
    }

    await supabase
      .from("applications")
      .update({ status: "failed", error_message: result.errorMessage ?? "Unknown error" })
      .eq("id", application.id);
    await logEvent(supabase, application.id, "APPLICATION_FAILED", { error: result.errorMessage });

    await supabase.from("notifications").insert({
      user_id: profile.id,
      type: "application_failed",
      title: "Application couldn't be completed",
      body: `We couldn't submit your application for ${job.title} at ${job.company_name}. You can retry, apply manually, or pass.`,
      metadata: { jobId: job.id, applicationId: application.id },
    });

    return { status: "failed", reason: result.errorMessage ?? "Unknown error" };
  }

  /**
   * Resolves every field on the employer's application form into
   * candidate.answers. Three disjoint kinds of field, each with its own
   * source of truth: document fields (type "file") are satisfied by the
   * already-prepared resume/cover letter; identity fields (role full_name/
   * first_name/last_name/email/phone) resolve only from structured profile
   * data; everything else is a screening question resolved ONLY through
   * answerQuestion()'s verified Answer Library matching — never CV-derived
   * or AI-generated content. A provider with no form is untouched
   * (identical to the previous no-op behavior). A required field of any
   * kind that can't be safely resolved stops the run before
   * submitApplication() is ever called; an optional one is simply omitted
   * rather than guessed.
   */
  private async resolveApplicationAnswers(
    supabase: SupabaseClient,
    application: Application,
    job: Job,
    profile: Profile,
    provider: ApplicationProvider,
    documents: { resumeText: string; coverLetterText: string }
  ): Promise<{ blocked: true; outcome: EngineOutcome } | { blocked: false; answers: Record<string, string> }> {
    const form = await provider.getApplicationForm(job);
    if (!form) {
      await logEvent(supabase, application.id, "QUESTIONS_COMPLETED", { note: "No dynamic screening questions detected for this channel." });
      return { blocked: false, answers: {} };
    }

    if (form.requiresHumanVerification) {
      // The provider detected something it must not attempt to bypass
      // (CAPTCHA, login wall, MFA) — stop immediately, before the Answer
      // Library is even fetched, so no answer can be resolved and no
      // candidate/submission is ever built for this run.
      const reasonText =
        "This employer's application requires manual human verification (CAPTCHA, login, or MFA) and cannot be completed automatically.";
      await this.markManual(supabase, application, reasonText, {
        channel: { method: job.application_method, provider: provider.key },
        metadata: { blockedReason: "human_verification_required" },
      });
      return { blocked: true, outcome: { status: "manual_required", reason: reasonText } };
    }

    const { data: libraryRows } = await supabase
      .from("answer_library")
      .select("*")
      .eq("user_id", profile.id)
      .eq("verified", true)
      .returns<AnswerLibraryEntry[]>();
    const library = libraryRows ?? [];

    // Looked up once, directly by key — not via answerQuestion()'s per-field
    // regex classification of each field's label, which routes many real
    // sponsorship phrasings to a different key ("sponsorship_requirement").
    // Boolean work-authorization resolution always cites this entry (if
    // any) as its audit-trail source, regardless of how a given field is
    // worded — the fact itself always comes from profile.work_authorization.
    const workAuthorizationEntry = library.find((e) => e.question_key === "work_authorization" && e.verified);

    const resolvedQuestions: { field: FormField; answer: string; sourceEntryId: string }[] = [];
    const resolvedIdentity: { field: FormField; answer: string; role: string }[] = [];
    const unansweredRequired: { field: FormField; reason: string }[] = [];

    for (const field of form.fields) {
      // Document fields (type "file") are never screening questions and
      // never contribute a candidate.answers entry — the actual document
      // is already on the candidate object (resumeText/resumeFileBuffer/
      // coverLetterText), which each provider's own submission code reads
      // directly. This branch only confirms the relevant document exists;
      // a file field this app has no recognized data for (role omitted,
      // or an unsupported document type) can never be synthesized.
      if (field.type === "file") {
        const satisfied = isDocumentRole(field.role) ? hasDocumentData(field.role, documents) : false;
        if (!satisfied && field.required) {
          unansweredRequired.push({
            field,
            reason: field.role === "resume" || field.role === "cover_letter" ? `missing_${field.role}_document` : "unrecognized_file_field",
          });
        }
        continue;
      }

      // Identity fields resolve ONLY from structured profile data — never
      // via answerQuestion()/the Answer Library, so a field asking for
      // "Full Name" or "Email" can never be misclassified as a screening
      // question with no verified answer. first_name/last_name come only
      // from profile.first_name/last_name — never split from full_name.
      if (isIdentityRole(field.role)) {
        const value = resolveIdentityFieldValue(field.role, profile);
        if (value) {
          resolvedIdentity.push({ field, answer: value, role: field.role });
        } else if (field.required) {
          unansweredRequired.push({ field, reason: "missing_structured_identity_data" });
        }
        continue;
      }

      // role is "screening_question" (the default when omitted) — unchanged pipeline.
      const result = await answerQuestion(field.label, library);
      const normalized = normalizeAnswerForField(field, result, {
        workAuthorization: profile.work_authorization,
        workAuthorizationEntryId: workAuthorizationEntry?.id ?? null,
      });
      if (normalized.ok) {
        resolvedQuestions.push({ field, answer: normalized.value, sourceEntryId: normalized.sourceEntryId });
      } else if (field.required) {
        unansweredRequired.push({ field, reason: normalized.reason });
      }
      // Optional field with no safe normalized answer: silently omitted, never fabricated.
    }

    // Persist the exact set of currently-unresolved required fields (full
    // FormField metadata — type, declared select options — not just the
    // label) so a future phase can render a correct answer input, and
    // reconcile away any previously-pending rows that are no longer
    // unresolved (resolved since, or no longer on the form). Phase 1 only
    // — no answering UI or retry route exists yet.
    await syncPendingQuestions(supabase, application.id, unansweredRequired);

    if (unansweredRequired.length > 0) {
      const reasonText = `This employer requires field(s) with no safe answer: ${unansweredRequired
        .map((u) => `"${u.field.label}"`)
        .join(", ")}.`;
      await this.markManual(supabase, application, reasonText, {
        // A real form WAS inspected via this provider, so the channel it
        // would have used is genuine information, unlike the "no provider
        // was ever selected" case which resets to manual/null.
        channel: { method: job.application_method, provider: provider.key },
        metadata: {
          questions: unansweredRequired.map((u) => ({ fieldId: u.field.id, questionText: u.field.label, reason: u.reason })),
        },
      });
      return { blocked: true, outcome: { status: "manual_required", reason: reasonText } };
    }

    if (resolvedIdentity.length > 0) {
      await logEvent(supabase, application.id, "IDENTITY_FIELDS_MAPPED", {
        fields: resolvedIdentity.map((r) => ({ fieldId: r.field.id, role: r.role })),
      });
    }

    if (resolvedQuestions.length > 0) {
      await logEvent(supabase, application.id, "ANSWERS_RESOLVED", {
        answers: resolvedQuestions.map((r) => ({ fieldId: r.field.id, questionText: r.field.label, sourceEntryId: r.sourceEntryId })),
      });
    } else {
      await logEvent(supabase, application.id, "QUESTIONS_COMPLETED", { note: "No dynamic screening questions detected for this channel." });
    }

    const answers = Object.fromEntries(
      [...resolvedQuestions, ...resolvedIdentity].map((r) => [r.field.id, r.answer])
    );
    return { blocked: false, answers };
  }

  /**
   * `clearChannel` resets application_method/application_provider to "manual"/null
   * — pass it only when no provider was ever selected for this run (no CV,
   * or selectProvider() returned null), so a stale value from an earlier
   * attempt (e.g. a provider that used to be reachable before this job's
   * domain was removed from the browser-automation allowlist) can't keep
   * claiming a specific automated channel was used. When a provider WAS
   * actually attempted and it returned manualRequired itself (e.g. it hit
   * a CAPTCHA), or its form was genuinely inspected (`channel`), leave/set
   * the channel fields to reflect what was really tried.
   */
  private async markManual(
    supabase: SupabaseClient,
    application: Application,
    reason: string,
    options: { clearChannel?: boolean; channel?: { method: string; provider: string }; metadata?: Record<string, unknown> } = {}
  ) {
    const updates: Record<string, unknown> = { status: "manual_required", manual_required: true, error_message: reason };
    if (options.clearChannel) {
      updates.application_method = "manual";
      updates.application_provider = null;
    } else if (options.channel) {
      updates.application_method = options.channel.method;
      updates.application_provider = options.channel.provider;
    }
    await supabase.from("applications").update(updates).eq("id", application.id);
    await logEvent(supabase, application.id, "MANUAL_ACTION_REQUIRED", { reason, ...options.metadata });
    await supabase.from("notifications").insert({
      user_id: application.user_id,
      type: "manual_action_required",
      title: "Manual application required",
      body: reason,
      metadata: { applicationId: application.id },
    });
  }
}

function profileToResumeText(profile: Profile): string {
  const lines = [
    profile.full_name ?? profile.email,
    profile.headline ?? "",
    profile.email,
    profile.phone ?? "",
    "",
    "Skills: " + (profile.skills.join(", ") || "n/a"),
    "Experience: " + (profile.job_titles.join(", ") || "n/a"),
    "Years of experience: " + (profile.years_experience ?? "n/a"),
  ];
  return lines.join("\n");
}

function summarizeParsedCv(parsed: { fullName?: string; skills?: string[]; jobTitles?: string[]; employers?: string[] } | null, profile: Profile): string {
  if (!parsed) return profileToResumeText(profile);
  const lines = [
    parsed.fullName ?? profile.full_name ?? profile.email,
    profile.email,
    "",
    "Skills: " + (parsed.skills?.join(", ") || profile.skills.join(", ") || "n/a"),
    "Job titles: " + (parsed.jobTitles?.join(", ") || "n/a"),
    "Employers: " + (parsed.employers?.join(", ") || "n/a"),
  ];
  return lines.join("\n");
}
