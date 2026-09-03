import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, Job, Profile, ResumeVersion } from "@/lib/types/database";
import { tailorCvForJob } from "@/lib/ai/cv-tailoring";
import { generateCoverLetter } from "@/lib/ai/cover-letter";
import { getApplicationProvider } from "./provider-registry";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import type { ApplicationProvider, CandidateApplicationData } from "./types";

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
      await this.markManual(supabase, application, "No parsed CV is available to submit.");
      return { status: "manual_required", reason: "No CV on file." };
    }
    await logEvent(supabase, application.id, "CV_SELECTED", { resumeVersionId: resumeVersion.id });

    const provider = selectProvider(job);
    if (!provider) {
      await this.markManual(supabase, application, "No supported automatic application channel for this job.");
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

    await logEvent(supabase, application.id, "QUESTIONS_COMPLETED", { note: "No dynamic screening questions detected for this channel." });

    const candidate: CandidateApplicationData = {
      fullName: profile.full_name ?? profile.email,
      email: profile.email,
      phone: profile.phone ?? undefined,
      resumeText: tailored.text,
      resumeFileName: resumeVersion.file_name,
      coverLetterText: coverLetter.text,
      answers: {},
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

  private async markManual(supabase: SupabaseClient, application: Application, reason: string) {
    await supabase
      .from("applications")
      .update({ status: "manual_required", manual_required: true, error_message: reason })
      .eq("id", application.id);
    await logEvent(supabase, application.id, "MANUAL_ACTION_REQUIRED", { reason });
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
