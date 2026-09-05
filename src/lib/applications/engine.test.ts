import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationAutomationEngine, selectProvider } from "./engine";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import { GreenhouseApplicationProvider } from "./providers/greenhouse-provider";
import { BaseApplicationProvider } from "./providers/base";
import type { ApplicationForm, CandidateApplicationData, SubmissionResult } from "./types";
import type { Application, AnswerLibraryEntry, Job, Profile, ResumeVersion } from "@/lib/types/database";

// A real, non-demo Greenhouse job shaped like the reported Betsson case:
// application_method "ats" with application_provider "greenhouse" (whose
// real submission provider is NOT_CONFIGURED — see
// providers/greenhouse-provider.ts), and a genuine application_url.
const GREENHOUSE_JOB = {
  id: "job-1",
  source: "greenhouse",
  application_method: "ats",
  application_provider: "greenhouse",
  application_url: "https://job-boards.greenhouse.io/betsson/jobs/123456",
  application_email: null,
  title: "Trading Operations Specialist",
  company_name: "Betsson Group",
} as unknown as Job;

test("selectProvider: a real Greenhouse job with no verified submission provider and no allowlisted domain never falls back to browser automation", () => {
  // BROWSER_AUTOMATION_ALLOWED_DOMAINS is not set when running tests (no
  // .env.local is loaded here), matching the real default/unconfigured
  // state this bug was reported against.
  const provider = selectProvider(GREENHOUSE_JOB);
  assert.equal(provider, null, "expected no provider (-> manual_required), not a fallback to browser automation");
});

test("BrowserAutomationApplicationProvider.isDomainAllowed: only matches explicitly allowlisted domains and their subdomains", () => {
  const url = "https://job-boards.greenhouse.io/betsson/jobs/123456";
  assert.equal(BrowserAutomationApplicationProvider.isDomainAllowed(url, []), false);
  assert.equal(BrowserAutomationApplicationProvider.isDomainAllowed(url, ["greenhouse.io"]), true);
  assert.equal(BrowserAutomationApplicationProvider.isDomainAllowed(url, ["job-boards.greenhouse.io"]), true);
  assert.equal(BrowserAutomationApplicationProvider.isDomainAllowed(url, ["lever.co"]), false);
  assert.equal(BrowserAutomationApplicationProvider.isDomainAllowed("not a url", ["greenhouse.io"]), false);
});

function createFakeSupabase(
  recorder: {
    applicationsUpdates: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
    events?: { event_type: string; metadata: Record<string, unknown> }[];
    librarySelectCallCount?: { count: number };
  },
  options: { libraryRows?: AnswerLibraryEntry[] } = {}
): SupabaseClient {
  const libraryRows = options.libraryRows ?? [];
  return {
    from(table: string) {
      if (table === "applications") {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(_col: string, _val: string) {
                recorder.applicationsUpdates.push(payload);
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }
      if (table === "application_events") {
        return {
          insert(payload: { event_type: string; metadata: Record<string, unknown> }) {
            recorder.events?.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "notifications") {
        return {
          insert(payload: Record<string, unknown>) {
            recorder.notifications.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === "submitted_documents") {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: `doc-${Math.random().toString(36).slice(2)}`, ...payload }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "answer_library") {
        return {
          select(_cols: string) {
            if (recorder.librarySelectCallCount) recorder.librarySelectCallCount.count++;
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              returns() {
                return builder;
              },
              then(onResolve: (result: { data: AnswerLibraryEntry[]; error: null }) => void) {
                const data = libraryRows.filter((row) =>
                  Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)
                );
                onResolve({ data, error: null });
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table in fake Supabase: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function makeLibraryEntry(overrides: Partial<AnswerLibraryEntry> = {}): AnswerLibraryEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    question_key: "custom_a",
    question_text: "Do you have a driving licence?",
    answer_text: "Yes, full clean licence.",
    answer_type: "text",
    verified: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Minimal profile/job fixtures satisfying the fields document preparation
 * (CV tailoring, cover letter template) actually touches with no
 * OPENAI_API_KEY configured (the case in this test environment). */
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "user-1",
    email: "candidate@example.com",
    full_name: "Candidate Name",
    headline: null,
    phone: null,
    skills: [],
    job_titles: [],
    years_experience: null,
    auto_apply_authorized: true,
    ...overrides,
  } as unknown as Profile;
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    source: "internal_test",
    application_method: "internal",
    application_provider: null,
    application_url: null,
    application_email: null,
    title: "Test Role",
    company_name: "Test Co",
    description: "A test job.",
    ...overrides,
  } as unknown as Job;
}

class FakeFormProvider extends BaseApplicationProvider {
  readonly key = "fake_form_provider";
  readonly name = "Fake form provider (test-only)";
  submitCallCount = 0;
  lastCandidate: CandidateApplicationData | null = null;

  constructor(private form: ApplicationForm | null) {
    super();
  }

  protected isConfigured(): boolean {
    return true;
  }

  async getApplicationForm(_job: Job): Promise<ApplicationForm | null> {
    return this.form;
  }

  protected async submitLive(_job: Job, candidate: CandidateApplicationData): Promise<SubmissionResult> {
    this.submitCallCount++;
    this.lastCandidate = candidate;
    return { success: true, externalApplicationId: "FAKE-1" };
  }
}

test("engine.run(): a real Greenhouse job with no verified provider resolves to manual_required, preserves the real application_url, and never reaches 'submitted'", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[] };
  const supabase = createFakeSupabase(recorder);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = { id: "user-1", email: "candidate@example.com", auto_apply_authorized: true } as unknown as Profile;
  // Truthy is all this path needs — document generation (which would read
  // its fields) is unreachable once selectProvider returns null, before
  // resumeVersion's contents are ever touched.
  const resumeVersion = {} as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job: GREENHOUSE_JOB, profile, resumeVersion });

  assert.equal(outcome.status, "manual_required");

  // The real employer application link lives on the job row, independent
  // of application processing, and must never be altered by it.
  assert.equal(GREENHOUSE_JOB.application_url, "https://job-boards.greenhouse.io/betsson/jobs/123456");

  assert.ok(recorder.applicationsUpdates.length > 0, "expected at least one applications update");
  for (const update of recorder.applicationsUpdates) {
    // Never a fabricated submission, and never a generic "failed" for what
    // is really just "no verified automatic channel yet".
    assert.notEqual(update.status, "submitted");
    assert.notEqual(update.status, "failed");
    // Document generation (submitted_resume_id/cover_letter_id) never ran
    // on this path — the false "CV/cover letter submitted" UI bug can only
    // happen if these get set without a real submission ever having been
    // attempted, and here they're never set at all.
    assert.equal("submitted_resume_id" in update, false);
    assert.equal("cover_letter_id" in update, false);
  }
  const finalUpdate = recorder.applicationsUpdates.at(-1);
  assert.equal(finalUpdate?.status, "manual_required");
  // No provider was ever selected on this path, so the channel fields must
  // be reset rather than left stale (e.g. carrying "browser_automation"
  // from an earlier attempt made before its domain was allowlist-gated) —
  // that stale value is exactly what showed up as "Browser_automation" on
  // the Applications page.
  assert.equal(finalUpdate?.application_method, "manual");
  assert.equal(finalUpdate?.application_provider, null);
});

test("engine.run(): a provider with no application form preserves current behavior (empty answers, submission proceeds)", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder);
  const provider = new FakeFormProvider(null);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.equal(provider.submitCallCount, 1);
  assert.deepEqual(provider.lastCandidate?.answers, {});
  assert.ok(
    recorder.events.some((e) => e.event_type === "QUESTIONS_COMPLETED"),
    "expected the unchanged no-form fallback event"
  );
  assert.ok(!recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"), "no form means nothing was resolved");
});

test("engine.run(): required questions resolved from verified Answer Library entries are submitted and logged with their source entry id", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const verifiedEntry = makeLibraryEntry({ id: "verified-licence", user_id: "user-1" });
  const unverifiedTrap = makeLibraryEntry({
    id: "unverified-trap",
    user_id: "user-1",
    question_key: "custom_trap",
    question_text: "Do you have a driving licence?",
    answer_text: "SHOULD NEVER BE USED",
    verified: false,
  });
  const supabase = createFakeSupabase(recorder, { libraryRows: [verifiedEntry, unverifiedTrap] });

  const form: ApplicationForm = {
    fields: [{ id: "licence", label: "Do you have a driving licence?", type: "text", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.equal(provider.submitCallCount, 1);
  assert.deepEqual(provider.lastCandidate?.answers, { licence: "Yes, full clean licence." });

  const resolvedEvent = recorder.events.find((e) => e.event_type === "ANSWERS_RESOLVED");
  assert.ok(resolvedEvent, "expected an ANSWERS_RESOLVED audit event");
  const answers = resolvedEvent!.metadata.answers as { fieldId: string; sourceEntryId: string }[];
  assert.equal(answers.length, 1);
  assert.equal(answers[0].sourceEntryId, "verified-licence");
  assert.notEqual(answers[0].sourceEntryId, "unverified-trap");
});

test("engine.run(): a required question with no safe verified answer stops before submitApplication() and sets manual_required, preserving the inspected channel", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "unknown_q", label: "What is your favorite mentoring philosophy?", type: "textarea", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob({ application_method: "internal" });
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0, "submitApplication must never be called when a required question is unanswered");

  const finalUpdate = recorder.applicationsUpdates.at(-1);
  assert.equal(finalUpdate?.status, "manual_required");
  assert.equal(finalUpdate?.manual_required, true);
  // A real form WAS inspected via this provider, so the channel it would
  // have used is preserved (unlike the "no provider ever selected" case,
  // which resets application_method/application_provider to manual/null).
  assert.equal(finalUpdate?.application_method, "internal");
  assert.equal(finalUpdate?.application_provider, "fake_form_provider");

  assert.ok(!recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"), "nothing was safely resolved");
  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  assert.ok(manualEvent, "expected a MANUAL_ACTION_REQUIRED audit event");
});

test("engine.run(): an optional unanswered question is omitted, not invented, and submission still proceeds", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const verifiedEntry = makeLibraryEntry({ id: "verified-licence" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [verifiedEntry] });

  const form: ApplicationForm = {
    fields: [
      { id: "licence", label: "Do you have a driving licence?", type: "text", required: true },
      { id: "optional_q", label: "What is your favorite mentoring philosophy?", type: "textarea", required: false },
    ],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.equal(provider.submitCallCount, 1);
  assert.deepEqual(provider.lastCandidate?.answers, { licence: "Yes, full clean licence." });
  assert.equal("optional_q" in (provider.lastCandidate?.answers ?? {}), false, "unanswered optional field must be omitted, never fabricated");
});

test("engine.run(): a hard-blocked EEO/legal question is never auto-answered even with a matching verified entry, and stops the run when required", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  // A user could plausibly save something under a custom key that happens
  // to textually match a hard-blocked employer question — this must still
  // never be used to auto-answer it.
  const trapEntry = makeLibraryEntry({
    id: "trap-entry",
    question_key: "custom_criminal",
    question_text: "Have you ever been convicted of a criminal offence?",
    answer_text: "No.",
    verified: true,
  });
  const supabase = createFakeSupabase(recorder, { libraryRows: [trapEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "criminal_record", label: "Have you ever been convicted of a criminal offence?", type: "boolean", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0, "a hard-blocked question must never be auto-answered, even with a matching verified entry");

  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  const questions = manualEvent?.metadata.questions as { reason: string }[] | undefined;
  assert.ok(questions?.some((q) => q.reason === "hard_blocked"));
});

test("engine.run(): requiresHumanVerification stops the run before the Answer Library is fetched, before answering, and before submission — channel preserved", async () => {
  const recorder = {
    applicationsUpdates: [] as Record<string, unknown>[],
    notifications: [] as Record<string, unknown>[],
    events: [] as { event_type: string; metadata: Record<string, unknown> }[],
    librarySelectCallCount: { count: 0 },
  };
  // A verified entry that WOULD resolve the field below if the engine ever
  // got as far as calling answerQuestion() for it — proving the guard stops
  // things before that point, not just that this particular field happens
  // to be unanswerable.
  const wouldMatchEntry = makeLibraryEntry({ id: "would-match", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "One month." });
  const supabase = createFakeSupabase(recorder, { libraryRows: [wouldMatchEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "notice", label: "What is your notice period?", type: "text", required: true }],
    requiresHumanVerification: true,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob({ application_method: "ats" });
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0, "submitApplication() must never be called when human verification is required");
  assert.equal(provider.lastCandidate, null, "no candidate/answers should ever be built for this run");
  assert.equal(recorder.librarySelectCallCount.count, 0, "the Answer Library must never be fetched when human verification is required");

  assert.ok(!recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"), "no ANSWERS_RESOLVED event when human verification blocked the run");
  assert.ok(!recorder.events.some((e) => e.event_type === "QUESTIONS_COMPLETED"), "no QUESTIONS_COMPLETED event when a form was inspected but blocked");

  const finalUpdate = recorder.applicationsUpdates.at(-1);
  assert.equal(finalUpdate?.status, "manual_required");
  assert.equal(finalUpdate?.manual_required, true);
  // The provider/channel that was genuinely inspected is preserved, not
  // reset to manual/null — a real form was returned by this provider.
  assert.equal(finalUpdate?.application_method, "ats");
  assert.equal(finalUpdate?.application_provider, "fake_form_provider");

  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  assert.ok(manualEvent, "expected a MANUAL_ACTION_REQUIRED audit event");
  assert.equal(manualEvent?.metadata.blockedReason, "human_verification_required");
});

test("engine.run(): requiresHumanVerification: false leaves existing answer-resolution behavior unchanged", async () => {
  const recorder = {
    applicationsUpdates: [] as Record<string, unknown>[],
    notifications: [] as Record<string, unknown>[],
    events: [] as { event_type: string; metadata: Record<string, unknown> }[],
    librarySelectCallCount: { count: 0 },
  };
  const verifiedEntry = makeLibraryEntry({ id: "verified-notice", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "One month." });
  const supabase = createFakeSupabase(recorder, { libraryRows: [verifiedEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "notice", label: "What is your notice period?", type: "text", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.equal(provider.submitCallCount, 1);
  assert.equal(recorder.librarySelectCallCount.count, 1, "the Answer Library is fetched exactly as before when human verification isn't required");
  assert.deepEqual(provider.lastCandidate?.answers, { notice: "One month." });
  assert.ok(recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"));
  assert.ok(!recorder.events.some((e) => e.metadata?.blockedReason === "human_verification_required"));
});

test("engine.run(): a boolean work-authorization field resolves from profile.work_authorization to the provider's declared true/false values", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization", question_text: "Are you authorized to work here?", answer_text: "I am an EU/EEA/Swiss citizen and do not require a visa or work permit to work in Malta." });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "auth", label: "Are you authorized to work in this location without sponsorship?", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ work_authorization: "eu_eea_swiss_citizen" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, { auth: "Yes" });

  const resolvedEvent = recorder.events.find((e) => e.event_type === "ANSWERS_RESOLVED");
  const answers = resolvedEvent?.metadata.answers as { fieldId: string; sourceEntryId: string }[] | undefined;
  assert.equal(answers?.[0]?.sourceEntryId, "wa-entry");
});

test("engine.run(): the SAME fact answered correctly for an opposite-polarity (sponsorship-phrased) boolean question", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry] });

  // Same profile fact (EU/EEA/Swiss citizen) as the previous test, but this
  // field is phrased the opposite way — "true" here means "requires
  // sponsorship" — so the correct answer must flip to "No".
  const form: ApplicationForm = {
    fields: [{ id: "sponsor", label: "Will you now or in the future require sponsorship?", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ work_authorization: "eu_eea_swiss_citizen" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, { sponsor: "No" });
});

test("engine.run(): a boolean question with no safe structured mapping (e.g. relocation) stops before submission, even with a matching free-text library entry", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization" });
  const relocationEntry = makeLibraryEntry({ id: "relo-entry", question_key: "relocation", question_text: "Are you willing to relocate?", answer_text: "Open to relocating within Malta." });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry, relocationEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "relocate", label: "Are you willing to relocate?", type: "boolean", required: true, trueValue: "Yes", falseValue: "No" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ work_authorization: "eu_eea_swiss_citizen" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0, "a boolean question with no safe structured mapping must never be auto-answered");
  assert.ok(!recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"));
});

test("engine.run(): a boolean field with no declared true/false representation stops before submission", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry] });

  const form: ApplicationForm = {
    // trueValue/falseValue intentionally omitted — the provider never declared its representation.
    fields: [{ id: "auth", label: "Are you authorized to work in this location without sponsorship?", type: "boolean", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ work_authorization: "eu_eea_swiss_citizen" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0);
});

test("engine.run(): a select field is only answered with the provider's own declared option value, never fuzzily matched", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const noticeEntry = makeLibraryEntry({ id: "notice-entry", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "1 Month" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [noticeEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "notice", label: "What is your notice period?", type: "select", required: true, options: ["2 weeks", "1 month", "3 months"] }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  // "1 Month" (our stored text) must become the PROVIDER's declared literal
  // value "1 month" (note the case difference), never sent verbatim as-is.
  assert.deepEqual(provider.lastCandidate?.answers, { notice: "1 month" });
});

test("engine.run(): a select field whose options don't match our stored answer stops before submission, never picks the closest option", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const noticeEntry = makeLibraryEntry({ id: "notice-entry", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "6 weeks" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [noticeEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "notice", label: "What is your notice period?", type: "select", required: true, options: ["2 weeks", "1 month", "3 months"] }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0);
});

test("engine.run(): structured identity fields (full_name, first_name, last_name, email, phone) resolve directly from the profile", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [
      { id: "f_full", label: "Full Name", type: "text", required: true, role: "full_name" },
      { id: "f_first", label: "First Name", type: "text", required: true, role: "first_name" },
      { id: "f_last", label: "Last Name", type: "text", required: true, role: "last_name" },
      { id: "f_email", label: "Email Address", type: "text", required: true, role: "email" },
      { id: "f_phone", label: "Phone Number", type: "text", required: false, role: "phone" },
    ],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ full_name: "Maria Borg", first_name: "Maria", last_name: "Borg", email: "maria@example.com", phone: "+356 7900 0000" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, {
    f_full: "Maria Borg",
    f_first: "Maria",
    f_last: "Borg",
    f_email: "maria@example.com",
    f_phone: "+356 7900 0000",
  });
  assert.equal(provider.lastCandidate?.firstName, "Maria");
  assert.equal(provider.lastCandidate?.lastName, "Borg");

  const identityEvent = recorder.events.find((e) => e.event_type === "IDENTITY_FIELDS_MAPPED");
  assert.ok(identityEvent, "expected an IDENTITY_FIELDS_MAPPED audit event");
});

test("engine.run(): a required identity field with missing structured data stops before submission, preserving the inspected channel", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_phone", label: "Phone Number", type: "text", required: true, role: "phone" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ phone: null });
  const job = makeJob({ application_method: "ats" });
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0);

  const finalUpdate = recorder.applicationsUpdates.at(-1);
  assert.equal(finalUpdate?.application_method, "ats");
  assert.equal(finalUpdate?.application_provider, "fake_form_provider");

  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  const questions = manualEvent?.metadata.questions as { reason: string }[] | undefined;
  assert.ok(questions?.some((q) => q.reason === "missing_structured_identity_data"));
});

test("engine.run(): an optional identity field with missing structured data is omitted, submission still proceeds", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_phone", label: "Phone Number", type: "text", required: false, role: "phone" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ phone: null });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, {});
});

test("engine.run(): first_name/last_name are never derived from full_name — a required first_name field blocks even though full_name is set", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_first", label: "First Name", type: "text", required: true, role: "first_name" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  // full_name is populated but first_name was never explicitly collected.
  const profile = makeProfile({ full_name: "Maria Anne Borg", first_name: null, last_name: null });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0, "must never guess a first name by splitting full_name");
});

test("engine.run(): identity-role fields never invoke answerQuestion(), even when a library entry would otherwise match their label", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  // A custom entry whose question_text exactly matches the field's label
  // and would resolve via answerQuestion()'s exact-text match — but must
  // never be consulted, because this field is identity-role, not a
  // screening question.
  const hijackEntry = makeLibraryEntry({ id: "hijack", question_key: "custom_hijack", question_text: "Email Address", answer_text: "WRONG-HIJACKED-VALUE@example.com" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [hijackEntry] });

  const form: ApplicationForm = {
    fields: [{ id: "f_email", label: "Email Address", type: "text", required: true, role: "email" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile({ email: "real-candidate@example.com" });
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, { f_email: "real-candidate@example.com" });
  assert.ok(!recorder.events.some((e) => e.event_type === "ANSWERS_RESOLVED"), "the identity field must not be counted as a resolved screening question");
});

test("engine.run(): a file field with role 'resume' is satisfied by the already-prepared resume data", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_resume", label: "Upload your resume", type: "file", required: true, role: "resume" }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, {});
});

test("engine.run(): a required file field with no recognized role stops before submission, never synthesizing a file", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_references", label: "Upload references", type: "file", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "manual_required");
  assert.equal(provider.submitCallCount, 0);

  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  const questions = manualEvent?.metadata.questions as { reason: string }[] | undefined;
  assert.ok(questions?.some((q) => q.reason === "unrecognized_file_field"));
});

test("engine.run(): an optional file field with no recognized role is omitted, submission still proceeds", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const form: ApplicationForm = {
    fields: [{ id: "f_references", label: "Upload references (optional)", type: "file", required: false }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(outcome.status, "submitted");
  assert.deepEqual(provider.lastCandidate?.answers, {});
});

test("engine.run(): the real GreenhouseApplicationProvider's getApplicationForm() drives the full field-resolution pipeline end to end, but submission stays impossible", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry] });

  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    assert.equal(url, "https://boards-api.greenhouse.io/v1/boards/betsson/jobs/123456?questions=true");
    return {
      ok: true,
      json: async () => ({
        id: 123456,
        questions: [
          { id: 1, label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
          { id: 2, label: "Email", required: true, fields: [{ name: "email", type: "input_text" }] },
          {
            id: 3,
            label: "Resume",
            required: true,
            fields: [
              { name: "resume", type: "input_file" },
              { name: "resume_text", type: "textarea" },
            ],
          },
          {
            id: 4,
            label: "Are you authorized to work in this location without sponsorship?",
            required: true,
            fields: [{ name: "question_4", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 2 }] }],
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const provider = new GreenhouseApplicationProvider();
    const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
    const profile = makeProfile({ full_name: "Maria Borg", email: "maria@example.com", work_authorization: "eu_eea_swiss_citizen" });
    const job = makeJob({
      source: "greenhouse",
      application_method: "ats",
      application_provider: "greenhouse",
      application_url: "https://job-boards.greenhouse.io/betsson/jobs/123456",
      source_job_id: "123456",
    });
    const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

    const engine = new ApplicationAutomationEngine();
    const outcome = await engine.run({ supabase, application, job, profile, resumeVersion, provider });

    // The multi_value_single_select "Yes"/"No" question is NOT a
    // work-authorization boolean in our model (it's type "select", not
    // "boolean" — Greenhouse's yes/no here is a two-option select), so it
    // has no verified answer_library text matching "Yes" or "No" exactly
    // and correctly can't auto-resolve — proving the pipeline genuinely
    // ran real field resolution against real-shaped data rather than
    // trivially succeeding.
    assert.equal(outcome.status, "manual_required");
    assert.equal(provider.getStatus(), "NOT_CONFIGURED");

    // Even if every field had resolved, isConfigured() staying false means
    // submission was never reachable regardless.
    assert.ok(!recorder.applicationsUpdates.some((u) => u.status === "submitted"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("selectProvider(): still cannot select Greenhouse for a real job even after getApplicationForm() is implemented — isConfigured() governs, not form availability", () => {
  const job = makeJob({
    source: "greenhouse",
    application_method: "ats",
    application_provider: "greenhouse",
    application_url: "https://job-boards.greenhouse.io/betsson/jobs/123456",
  });
  assert.equal(selectProvider(job), null);
});
