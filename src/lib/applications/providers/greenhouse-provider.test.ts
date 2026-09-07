import { test } from "node:test";
import assert from "node:assert/strict";
import { GreenhouseApplicationProvider } from "./greenhouse-provider";
import type { Job } from "@/lib/types/database";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    source: "greenhouse",
    source_job_id: "123456",
    application_method: "ats",
    application_provider: "greenhouse",
    application_url: "https://job-boards.greenhouse.io/betsson/jobs/123456",
    application_email: null,
    title: "Trading Operations Specialist",
    company_name: "Betsson Group",
    ...overrides,
  } as unknown as Job;
}

/** Temporarily replaces global.fetch for one test, always restoring it afterward. */
async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>) {
  const original = global.fetch;
  global.fetch = impl as typeof fetch;
  try {
    await run();
  } finally {
    global.fetch = original;
  }
}

test("GreenhouseApplicationProvider.isConfigured() stays false regardless of getApplicationForm() working", () => {
  const provider = new GreenhouseApplicationProvider();
  assert.equal(provider.getStatus(), "NOT_CONFIGURED");
});

test("GreenhouseApplicationProvider.submitLive() still throws — submission stays disabled", async () => {
  const provider = new GreenhouseApplicationProvider();
  const result = await provider.submitApplication(makeJob(), {
    fullName: "Test",
    email: "test@example.com",
    resumeText: "resume",
    answers: {},
  });
  assert.equal(result.success, false);
  assert.match(result.errorMessage ?? "", /not configured/i);
});

test("getApplicationForm(): fetches only the public questions=true endpoint, with no credentials/headers, and maps the response", async () => {
  const provider = new GreenhouseApplicationProvider();
  let calledUrl: string | undefined;
  let calledInit: RequestInit | undefined;

  await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledInit = init;
      return {
        ok: true,
        json: async () => ({
          id: 123456,
          questions: [{ id: 1, label: "First Name", required: true, fields: [{ name: "first_name", type: "input_text" }] }],
        }),
      } as Response;
    }) as typeof fetch,
    async () => {
      const form = await provider.getApplicationForm(makeJob());
      assert.ok(form);
      assert.equal(form?.fields.length, 1);
      assert.equal(form?.fields[0].role, "first_name");
    }
  );

  assert.equal(calledUrl, "https://boards-api.greenhouse.io/v1/boards/betsson/jobs/123456?questions=true");
  const headers = calledInit && "headers" in calledInit ? calledInit.headers : undefined;
  assert.equal(headers, undefined, "no auth headers/credentials are ever sent");
});

test("getApplicationForm(): a non-2xx response returns null, identical to 'no form'", async () => {
  const provider = new GreenhouseApplicationProvider();
  await withMockedFetch(
    (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch,
    async () => {
      const form = await provider.getApplicationForm(makeJob());
      assert.equal(form, null);
    }
  );
});

test("getApplicationForm(): malformed JSON (no questions array) returns null", async () => {
  const provider = new GreenhouseApplicationProvider();
  await withMockedFetch(
    (async () => ({ ok: true, json: async () => ({ id: 123456 }) })) as unknown as typeof fetch,
    async () => {
      const form = await provider.getApplicationForm(makeJob());
      assert.equal(form, null);
    }
  );
});

test("getApplicationForm(): a thrown network error returns null rather than crashing the caller", async () => {
  const provider = new GreenhouseApplicationProvider();
  await withMockedFetch(
    (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch,
    async () => {
      const form = await provider.getApplicationForm(makeJob());
      assert.equal(form, null);
    }
  );
});

test("getApplicationForm(): a job with no recognizable Greenhouse board token in its URL returns null without ever calling fetch", async () => {
  const provider = new GreenhouseApplicationProvider();
  let fetchCalled = false;
  await withMockedFetch(
    (async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({ questions: [] }) } as Response;
    }) as typeof fetch,
    async () => {
      const form = await provider.getApplicationForm(makeJob({ application_url: "https://example.com/not-greenhouse" }));
      assert.equal(form, null);
    }
  );
  assert.equal(fetchCalled, false);
});
