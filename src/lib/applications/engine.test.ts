import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationAutomationEngine, selectProvider } from "./engine";
import { getApplicationProvider } from "./provider-registry";
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
  options: { libraryRows?: AnswerLibraryEntry[]; pendingQuestionsTable?: Record<string, unknown>[] } = {}
): SupabaseClient {
  const libraryRows = options.libraryRows ?? [];
  const pendingQuestions = options.pendingQuestionsTable ?? [];
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
      if (table === "application_pending_questions") {
        return {
          upsert(rows: Record<string, unknown>[]) {
            for (const row of rows) {
              const idx = pendingQuestions.findIndex(
                (r) => r.application_id === row.application_id && r.field_id === row.field_id
              );
              if (idx >= 0) {
                pendingQuestions[idx] = { ...pendingQuestions[idx], ...row, updated_at: "2024-06-01T00:00:00Z" };
              } else {
                pendingQuestions.push({
                  id: `pq-${Math.random().toString(36).slice(2)}`,
                  answer_value: null,
                  answer_source: null,
                  source_answer_library_id: null,
                  created_at: "2024-06-01T00:00:00Z",
                  updated_at: "2024-06-01T00:00:00Z",
                  ...row,
                });
              }
            }
            return Promise.resolve({ data: null, error: null });
          },
          select(_cols: string) {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              then(onResolve: (result: { data: Record<string, unknown>[]; error: null }) => void) {
                const data = pendingQuestions.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
                onResolve({ data, error: null });
              },
            };
            return builder;
          },
          delete() {
            const filters: Record<string, unknown> = {};
            const builder = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return builder;
              },
              in(col: string, values: unknown[]) {
                for (let i = pendingQuestions.length - 1; i >= 0; i--) {
                  const row = pendingQuestions[i];
                  const matchesEq = Object.entries(filters).every(([k, v]) => row[k] === v);
                  if (matchesEq && values.includes(row[col])) pendingQuestions.splice(i, 1);
                }
                return Promise.resolve({ data: null, error: null });
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
  const profile = makeProfile();
  // Truthy is all this path needs — document generation (which would read
  // its fields) is unreachable once selectProvider returns null, before
  // resumeVersion's contents are ever touched.
  const resumeVersion = {} as unknown as ResumeVersion;

  // Since selectProvider() returns null here, the engine's !provider branch
  // now also performs best-effort, read-only Greenhouse form inspection
  // (see the "read-only form inspection" tests below) — which means this
  // path genuinely calls fetch(). Mock it so this test makes no real
  // network call regardless of that side effect.
  const originalFetch = global.fetch;
  global.fetch = (async () => ({ ok: true, json: async () => ({ id: 123456, questions: [] }) })) as unknown as typeof fetch;

  try {
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
  } finally {
    global.fetch = originalFetch;
  }
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
    fields: [
      {
        id: "notice",
        label: "What is your notice period?",
        type: "select",
        required: true,
        options: [
          { label: "2 weeks", value: "2 weeks" },
          { label: "1 month", value: "1 month" },
          { label: "3 months", value: "3 months" },
        ],
      },
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
  // "1 Month" (our stored text) must become the PROVIDER's declared literal
  // value "1 month" (note the case difference), never sent verbatim as-is.
  assert.deepEqual(provider.lastCandidate?.answers, { notice: "1 month" });
});

test("engine.run(): a select field whose options don't match our stored answer stops before submission, never picks the closest option", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const noticeEntry = makeLibraryEntry({ id: "notice-entry", question_key: "notice_period", question_text: "What is your notice period?", answer_text: "6 weeks" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [noticeEntry] });

  const form: ApplicationForm = {
    fields: [
      {
        id: "notice",
        label: "What is your notice period?",
        type: "select",
        required: true,
        options: [
          { label: "2 weeks", value: "2 weeks" },
          { label: "1 month", value: "1 month" },
          { label: "3 months", value: "3 months" },
        ],
      },
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

test("engine.run(): the real GreenhouseApplicationProvider correctly satisfies a Betsson-shaped resume+cover-letter pairing without falsely forcing manual_required", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const supabase = createFakeSupabase(recorder, { libraryRows: [] });

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({
      id: 123456,
      questions: [
        { id: 1, label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] },
        { id: 2, label: "Last Name", required: true, fields: [{ name: "last_name", type: "input_text" }] },
        { id: 3, label: "Email", required: true, fields: [{ name: "email", type: "input_text" }] },
        { id: 4, label: "Phone", required: true, fields: [{ name: "phone", type: "input_text" }] },
        {
          id: 5,
          label: "Resume/CV",
          required: true,
          fields: [
            { name: "resume", type: "input_file" },
            { name: "resume_text", type: "textarea" },
          ],
        },
        {
          id: 6,
          label: "Cover Letter",
          required: true,
          fields: [
            { name: "cover_letter", type: "input_file" },
            { name: "cover_letter_text", type: "textarea" },
          ],
        },
      ],
    }),
  })) as unknown as typeof fetch;

  try {
    const provider = new GreenhouseApplicationProvider();
    const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
    const profile = makeProfile({ full_name: "Maria Borg", first_name: "Maria", last_name: "Borg", email: "maria@example.com", phone: "+356 7900 0000" });
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

    // Everything on this form is satisfiable (identity fields from the
    // profile, resume/cover-letter from the already-prepared documents),
    // so field resolution itself must succeed cleanly — the run can only
    // still end in manual_required via GreenhouseApplicationProvider
    // staying NOT_CONFIGURED (BaseApplicationProvider's own safety check),
    // never via a phantom "unanswered question" caused by the
    // cover_letter_text bug. The reason text below is what proves which
    // one actually happened.
    assert.equal(outcome.status, "manual_required");
    assert.match(outcome.status === "manual_required" ? outcome.reason : "", /not configured/i);
    assert.equal(provider.getStatus(), "NOT_CONFIGURED");
    assert.ok(!recorder.applicationsUpdates.some((u) => u.status === "submitted"), "isConfigured() still blocks any real submission");
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

// ---- Phase 1: application_pending_questions persistence ----

test("engine.run(): persists real Betsson-shaped text question metadata (e.g. 'How big is your affiliate portfolio?') into application_pending_questions", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const form: ApplicationForm = {
    fields: [{ id: "question_67190346", label: "How big is your affiliate portfolio?", type: "text", required: true }],
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
  assert.equal(pendingQuestionsTable.length, 1);
  const row = pendingQuestionsTable[0];
  assert.equal(row.application_id, "application-1");
  assert.equal(row.field_id, "question_67190346");
  assert.equal(row.question_text, "How big is your affiliate portfolio?");
  assert.equal(row.field_type, "text");
  assert.equal(row.options, null);
  assert.equal(row.required, true);
});

test("engine.run(): persists real Betsson-shaped select options, preserving 'Yes' -> '1' and 'No' -> '0' exactly", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const form: ApplicationForm = {
    fields: [
      {
        id: "question_relocate",
        label: "Would you need to relocate in order to perform this role?",
        type: "select",
        required: true,
        options: [
          { label: "Yes", value: "1" },
          { label: "No", value: "0" },
        ],
      },
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

  assert.equal(outcome.status, "manual_required");
  assert.equal(pendingQuestionsTable.length, 1);
  const row = pendingQuestionsTable[0];
  assert.equal(row.field_type, "select");
  assert.deepEqual(row.options, [
    { label: "Yes", value: "1" },
    { label: "No", value: "0" },
  ]);
});

test("engine.run(): repeated persistence for the same (application_id, field_id) updates the existing row rather than duplicating it", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const form: ApplicationForm = {
    fields: [{ id: "question_67190346", label: "How big is your affiliate portfolio?", type: "text", required: true }],
    requiresHumanVerification: false,
  };

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;
  const engine = new ApplicationAutomationEngine();

  // Simulates the existing admin retry route re-running engine.run() against
  // the same application — nothing has changed, so the same field is still
  // unresolved on the second pass.
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(form) });
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(form) });

  assert.equal(pendingQuestionsTable.length, 1, "must update the existing row, never insert a second one");
});

test("engine.run(): pending-question rows never carry a fabricated or pre-populated answer", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const form: ApplicationForm = {
    fields: [
      { id: "question_67190346", label: "How big is your affiliate portfolio?", type: "text", required: true },
      {
        id: "question_relocate",
        label: "Would you need to relocate in order to perform this role?",
        type: "select",
        required: true,
        options: [
          { label: "Yes", value: "1" },
          { label: "No", value: "0" },
        ],
      },
    ],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  assert.equal(pendingQuestionsTable.length, 2);
  for (const row of pendingQuestionsTable) {
    assert.equal(row.answer_value, null, `answer_value must stay null for ${row.field_id} — Phase 1 never answers questions`);
    assert.equal(row.answer_source, null);
    assert.equal(row.source_answer_library_id, null);
  }
});

test("engine.run(): reconciliation removes pending rows for fields that are no longer unresolved", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;
  const engine = new ApplicationAutomationEngine();

  const firstForm: ApplicationForm = {
    fields: [
      { id: "question_a", label: "How big is your affiliate portfolio?", type: "text", required: true },
      { id: "question_b", label: "Would you need to relocate in order to perform this role?", type: "select", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] },
    ],
    requiresHumanVerification: false,
  };
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(firstForm) });
  assert.equal(pendingQuestionsTable.length, 2);

  // On a later re-evaluation, question_a is no longer present on the
  // employer's form (or was otherwise resolved) — only question_b remains
  // unresolved. The stale question_a row must be cleaned up, not left as a
  // permanent blocker.
  const secondForm: ApplicationForm = {
    fields: [{ id: "question_b", label: "Would you need to relocate in order to perform this role?", type: "select", required: true, options: [{ label: "Yes", value: "1" }, { label: "No", value: "0" }] }],
    requiresHumanVerification: false,
  };
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(secondForm) });

  assert.equal(pendingQuestionsTable.length, 1);
  assert.equal(pendingQuestionsTable[0].field_id, "question_b");
});

test("engine.run(): a fully-resolved application clears every previously-pending row", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const workAuthEntry = makeLibraryEntry({ id: "wa-entry", question_key: "work_authorization" });
  const supabase = createFakeSupabase(recorder, { libraryRows: [workAuthEntry], pendingQuestionsTable });

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob();
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;
  const engine = new ApplicationAutomationEngine();

  const blockedForm: ApplicationForm = {
    fields: [{ id: "question_a", label: "How big is your affiliate portfolio?", type: "text", required: true }],
    requiresHumanVerification: false,
  };
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(blockedForm) });
  assert.equal(pendingQuestionsTable.length, 1);

  // The blocking question is gone from a later fetch of the form (e.g. the
  // employer removed it) — nothing is unresolved any more.
  const resolvedForm: ApplicationForm = { fields: [], requiresHumanVerification: false };
  await engine.run({ supabase, application, job, profile, resumeVersion, provider: new FakeFormProvider(resolvedForm) });

  assert.equal(pendingQuestionsTable.length, 0);
});

test("engine.run(): existing MANUAL_ACTION_REQUIRED event metadata shape is unchanged by Phase 1 persistence", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const form: ApplicationForm = {
    fields: [{ id: "question_67190346", label: "How big is your affiliate portfolio?", type: "text", required: true }],
    requiresHumanVerification: false,
  };
  const provider = new FakeFormProvider(form);

  const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
  const profile = makeProfile();
  const job = makeJob({ application_method: "ats" });
  const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

  const engine = new ApplicationAutomationEngine();
  await engine.run({ supabase, application, job, profile, resumeVersion, provider });

  const manualEvent = recorder.events.find((e) => e.event_type === "MANUAL_ACTION_REQUIRED");
  assert.ok(manualEvent);
  const questions = manualEvent?.metadata.questions as { fieldId: string; questionText: string; reason: string }[] | undefined;
  assert.deepEqual(questions, [{ fieldId: "question_67190346", questionText: "How big is your affiliate portfolio?", reason: "unmatched" }]);

  const finalUpdate = recorder.applicationsUpdates.at(-1);
  assert.equal(finalUpdate?.status, "manual_required");
  assert.equal(finalUpdate?.application_method, "ats");
  assert.equal(finalUpdate?.application_provider, "fake_form_provider");
});

// ---- Read-only form inspection when no LIVE submission channel exists ----
//
// selectProvider() returning null (e.g. every real Greenhouse job today,
// since GreenhouseApplicationProvider.isConfigured() is hardcoded false) is
// a submission-authorization fact, not a reason to also lose visibility
// into the employer's declared required fields. These tests exercise
// ApplicationAutomationEngine's separate, best-effort
// inspectRawProviderFormForPendingQuestions() path, which looks the
// provider up directly by job.application_provider and calls only
// getApplicationForm() — never submitApplication()/submitLive() — so that
// application_pending_questions is populated even though the job can never
// actually be auto-submitted.

function greenhouseJobFixture(overrides: Partial<Job> = {}): Job {
  return makeJob({
    source: "greenhouse",
    application_method: "ats",
    application_provider: "greenhouse",
    application_url: "https://job-boards.greenhouse.io/betsson/jobs/123456",
    source_job_id: "123456",
    ...overrides,
  });
}

test("engine.run(): a real Greenhouse NOT_CONFIGURED job still has its public form inspected, and unresolved Betsson-shaped questions are persisted — while isConfigured() stays false and submitApplication() is never called", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const originalFetch = global.fetch;
  global.fetch = (async (url: string) => {
    assert.equal(url, "https://boards-api.greenhouse.io/v1/boards/betsson/jobs/123456?questions=true");
    return {
      ok: true,
      json: async () => ({
        id: 123456,
        questions: [
          { id: 1, label: "How big is your affiliate portfolio?", required: true, fields: [{ name: "question_1", type: "input_text" }] },
          {
            id: 2,
            label: "Would you need to relocate in order to perform this role?",
            required: true,
            fields: [{ name: "question_2", type: "multi_value_single_select", values: [{ label: "Yes", value: 1 }, { label: "No", value: 0 }] }],
          },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  // Proves submitApplication() is genuinely never invoked on this path,
  // rather than merely returning a non-"submitted" result — the real
  // GreenhouseApplicationProvider singleton (shared with provider-registry
  // and selectProvider()) is spied on directly.
  const greenhouseProvider = getApplicationProvider("greenhouse")!;
  const originalSubmitApplication = greenhouseProvider.submitApplication.bind(greenhouseProvider);
  let submitApplicationCalled = false;
  (greenhouseProvider as { submitApplication: typeof greenhouseProvider.submitApplication }).submitApplication = async (...args) => {
    submitApplicationCalled = true;
    return originalSubmitApplication(...args);
  };

  try {
    const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
    const profile = makeProfile();
    const job = greenhouseJobFixture();
    const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

    const engine = new ApplicationAutomationEngine();
    const outcome = await engine.run({ supabase, application, job, profile, resumeVersion });

    // The outcome is unchanged from before this fix: still manual_required
    // for "no automatic application channel", not altered by inspection.
    assert.equal(outcome.status, "manual_required");
    assert.equal(outcome.status === "manual_required" ? outcome.reason : "", "No automatic application channel available.");

    assert.equal(submitApplicationCalled, false, "submitApplication() must never be called by read-only inspection");
    assert.equal(greenhouseProvider.getStatus(), "NOT_CONFIGURED", "isConfigured() must remain false — inspection never flips submission authorization");
    assert.ok(!recorder.applicationsUpdates.some((u) => u.status === "submitted" || u.status === "applying"));

    assert.equal(pendingQuestionsTable.length, 2, "both unresolved Betsson-shaped questions must be persisted");
    const byField = Object.fromEntries(pendingQuestionsTable.map((r) => [r.field_id as string, r]));
    assert.equal(byField.question_1.question_text, "How big is your affiliate portfolio?");
    assert.equal(byField.question_1.field_type, "text");
    assert.equal(byField.question_2.field_type, "select");
    assert.deepEqual(byField.question_2.options, [
      { label: "Yes", value: "1" },
      { label: "No", value: "0" },
    ]);
    for (const row of pendingQuestionsTable) {
      assert.equal(row.answer_value, null, "Phase 1 inspection never writes an answer, same as the submission path");
    }

    // Channel fields still reset exactly as before this fix — no provider
    // was ever selected/authorized for submission, so nothing "real" is
    // claimed as the application's channel just because its form was read.
    const finalUpdate = recorder.applicationsUpdates.at(-1);
    assert.equal(finalUpdate?.application_method, "manual");
    assert.equal(finalUpdate?.application_provider, null);
  } finally {
    global.fetch = originalFetch;
    delete (greenhouseProvider as { submitApplication?: unknown }).submitApplication;
  }
});

test("engine.run(): read-only inspection never fabricates document availability — a real resume resolves from actual profile/CV data, but a required cover-letter field is always left unresolved", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({
      id: 123456,
      questions: [
        {
          id: 5,
          label: "Resume/CV",
          required: true,
          fields: [
            { name: "resume", type: "input_file" },
            { name: "resume_text", type: "textarea" },
          ],
        },
        {
          id: 6,
          label: "Cover Letter",
          required: true,
          fields: [
            { name: "cover_letter", type: "input_file" },
            { name: "cover_letter_text", type: "textarea" },
          ],
        },
      ],
    }),
  })) as unknown as typeof fetch;

  try {
    const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
    // Real, non-empty structured data — profileToResumeText(profile) will
    // genuinely produce non-empty text from this, never a placeholder.
    const profile = makeProfile({ full_name: "Maria Borg", email: "maria@example.com" });
    const job = greenhouseJobFixture();
    const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

    const engine = new ApplicationAutomationEngine();
    const outcome = await engine.run({ supabase, application, job, profile, resumeVersion });

    assert.equal(outcome.status, "manual_required");

    // Only the cover-letter field is pending: the resume field was resolved
    // from resumeVersion's already-real, already-confirmed existence (never
    // a fabricated placeholder), while the cover letter — which has not
    // actually been generated at this point in the run — is honestly
    // reported as unresolved rather than falsely satisfied.
    assert.equal(pendingQuestionsTable.length, 1);
    assert.equal(pendingQuestionsTable[0].field_id, "cover_letter");
    assert.equal(pendingQuestionsTable[0].question_text, "Cover Letter");
  } finally {
    global.fetch = originalFetch;
  }
});

test("engine.run(): a fetch failure during read-only Greenhouse form inspection fails closed — still resolves to manual_required with no pending-question rows persisted", async () => {
  const recorder = { applicationsUpdates: [] as Record<string, unknown>[], notifications: [] as Record<string, unknown>[], events: [] as { event_type: string; metadata: Record<string, unknown> }[] };
  const pendingQuestionsTable: Record<string, unknown>[] = [];
  const supabase = createFakeSupabase(recorder, { libraryRows: [], pendingQuestionsTable });

  const originalFetch = global.fetch;
  global.fetch = (async () => {
    throw new Error("simulated network failure");
  }) as unknown as typeof fetch;

  try {
    const application = { id: "application-1", user_id: "user-1", job_id: "job-1" } as unknown as Application;
    const profile = makeProfile();
    const job = greenhouseJobFixture();
    const resumeVersion = { id: "rv-1", parsed_data: null, file_name: "cv.pdf" } as unknown as ResumeVersion;

    const engine = new ApplicationAutomationEngine();
    const outcome = await engine.run({ supabase, application, job, profile, resumeVersion });

    // GreenhouseApplicationProvider.getApplicationForm() itself already
    // catches fetch errors and returns null (see providers/greenhouse-provider.ts),
    // and inspectRawProviderFormForPendingQuestions() wraps everything in
    // its own try/catch on top of that — either layer failing closed must
    // still land here, at the same manual_required outcome as always.
    assert.equal(outcome.status, "manual_required");
    assert.equal(outcome.status === "manual_required" ? outcome.reason : "", "No automatic application channel available.");
    assert.equal(pendingQuestionsTable.length, 0, "a failed inspection must not persist any (fabricated or partial) pending rows");

    const finalUpdate = recorder.applicationsUpdates.at(-1);
    assert.equal(finalUpdate?.status, "manual_required");
    assert.equal(finalUpdate?.application_method, "manual");
    assert.equal(finalUpdate?.application_provider, null);
  } finally {
    global.fetch = originalFetch;
  }
});
