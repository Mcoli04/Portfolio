import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApplicationAutomationEngine, selectProvider } from "./engine";
import { BrowserAutomationApplicationProvider } from "./providers/browser-automation-provider";
import type { Application, Job, Profile, ResumeVersion } from "@/lib/types/database";

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

function createFakeSupabase(recorder: {
  applicationsUpdates: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
}): SupabaseClient {
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
          insert(_payload: unknown) {
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
      throw new Error(`Unexpected table in fake Supabase: ${table}`);
    },
  } as unknown as SupabaseClient;
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
  assert.equal(recorder.applicationsUpdates.at(-1)?.status, "manual_required");
});
