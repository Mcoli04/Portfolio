import { test } from "node:test";
import assert from "node:assert/strict";
import { GreenhouseApplicationProvider, type GreenhouseCredentialResolver } from "./greenhouse-provider";
import type { Job } from "@/lib/types/database";
import type { CandidateApplicationData } from "../types";

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

/**
 * Fictional test board tokens ("authorized-test-board" / "other-test-board")
 * — deliberately never the real Malta board tokens used elsewhere in this
 * codebase (GREENHOUSE_BOARD_TOKENS), so authorization-logic tests can never
 * be mistaken for actually authorizing a real employer.
 */
function makeAuthTestJob(boardToken: string, sourceJobId = "999"): Job {
  return {
    id: "job-auth-test",
    source: "greenhouse",
    source_job_id: sourceJobId,
    application_method: "ats",
    application_provider: "greenhouse",
    application_url: `https://job-boards.greenhouse.io/${boardToken}/jobs/${sourceJobId}`,
    application_email: null,
    title: "Test Role",
    company_name: "Test Employer",
  } as unknown as Job;
}

function makeCandidate(overrides: Partial<CandidateApplicationData> = {}): CandidateApplicationData {
  return {
    fullName: "Test Candidate",
    firstName: "Test",
    lastName: "Candidate",
    email: "test.candidate@example.com",
    resumeText: "resume text",
    answers: { first_name: "Test", last_name: "Candidate", email: "test.candidate@example.com" },
    ...overrides,
  };
}

/** Never a real credential — a fixed, obviously-fake test string. */
const FAKE_TEST_API_KEY = "fake-test-only-api-key-not-real";

function fakeResolver(boardKeys: Record<string, string | undefined>): GreenhouseCredentialResolver {
  return {
    hasAnyAuthorizedBoard: () => Object.values(boardKeys).some((key) => Boolean(key)),
    getApiKey: (boardToken: string) => boardKeys[boardToken],
  };
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

test("GreenhouseApplicationProvider.isConfigured() stays false by default — no employer is authorized out of the box", () => {
  const provider = new GreenhouseApplicationProvider();
  assert.equal(provider.getStatus(), "NOT_CONFIGURED");
});

test("GreenhouseApplicationProvider.submitApplication() stays disabled by default — no board is authorized", async () => {
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

// ============================================================================
// Per-board authorization: isConfigured() / isJobEligible()
// ============================================================================

test("isConfigured(): false when the resolver reports no authorized board at all", () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({}));
  assert.equal(provider.getStatus(), "NOT_CONFIGURED");
});

test("isConfigured(): true once the resolver reports at least one authorized+keyed board", () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  assert.equal(provider.getStatus(), "LIVE");
});

test("isJobEligible(): true only for a job whose board has its own key from the resolver", () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  assert.equal(provider.isJobEligible({ applicationUrl: "https://job-boards.greenhouse.io/authorized-test-board/jobs/1" }), true);
});

test("isJobEligible(): false for a different board, even while another board IS authorized (no cross-board eligibility)", () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  assert.equal(provider.isJobEligible({ applicationUrl: "https://job-boards.greenhouse.io/other-test-board/jobs/1" }), false);
});

test("isJobEligible(): false for a non-Greenhouse or unparseable URL", () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  assert.equal(provider.isJobEligible({ applicationUrl: "https://example.com/careers" }), false);
  assert.equal(provider.isJobEligible({ applicationUrl: null }), false);
  assert.equal(provider.isJobEligible({ applicationUrl: undefined }), false);
});

// ============================================================================
// submitLive(): unauthorized/unkeyed boards make ZERO network requests
// ============================================================================

test("submitApplication(): an unauthorized board is refused with manual_required and makes zero Greenhouse requests", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  let fetchCalled = false;

  await withMockedFetch(
    (async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) } as Response;
    }) as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("unauthorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.equal(result.manualRequired, true);
      assert.match(result.errorMessage ?? "", /not been authorized/i);
    }
  );

  assert.equal(fetchCalled, false, "an unauthorized board must never reach Greenhouse's API");
});

test("submitApplication(): cross-board credential isolation — an allowlisted board with no key of its own is refused, never borrowing another board's key", async () => {
  // Both boards are on the allowlist (hasAnyAuthorizedBoard is true), but
  // only "authorized-test-board" actually has a key. "keyless-test-board"
  // must still fail safe — it must NEVER use authorized-test-board's key.
  const resolver: GreenhouseCredentialResolver = {
    hasAnyAuthorizedBoard: () => true,
    getApiKey: (boardToken: string) => (boardToken === "authorized-test-board" ? FAKE_TEST_API_KEY : undefined),
  };
  const provider = new GreenhouseApplicationProvider(resolver);
  let fetchCalled = false;
  let capturedAuthHeader: string | undefined;

  await withMockedFetch(
    (async (_url: string, init?: RequestInit) => {
      fetchCalled = true;
      const headers = init?.headers as Record<string, string> | undefined;
      capturedAuthHeader = headers?.Authorization;
      return { ok: true, json: async () => ({ status: "submitted" }) } as Response;
    }) as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("keyless-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.equal(result.manualRequired, true);
    }
  );

  assert.equal(fetchCalled, false, "a keyless board must never send a request, even using another board's credential");
  assert.equal(capturedAuthHeader, undefined);
});

test("submitApplication(): an authorized+keyed board's own key IS used, correctly Base64-encoded as HTTP Basic auth", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  let calledUrl: string | undefined;
  let capturedAuthHeader: string | undefined;
  let capturedBody: Record<string, unknown> | undefined;

  await withMockedFetch(
    (async (url: string, init?: RequestInit) => {
      calledUrl = url;
      const headers = init?.headers as Record<string, string> | undefined;
      capturedAuthHeader = headers?.Authorization;
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return { ok: true, json: async () => ({ status: "submitted" }) } as Response;
    }) as typeof fetch,
    async () => {
      const result = await provider.submitApplication(
        makeAuthTestJob("authorized-test-board", "555"),
        makeCandidate({ resumeFileBuffer: Buffer.from("pdf-bytes"), resumeFileName: "cv.pdf" })
      );
      assert.equal(result.success, true);
    }
  );

  assert.equal(calledUrl, "https://boards-api.greenhouse.io/v1/boards/authorized-test-board/jobs/555");
  assert.equal(capturedAuthHeader, `Basic ${Buffer.from(`${FAKE_TEST_API_KEY}:`).toString("base64")}`);
  assert.equal(capturedBody?.first_name, "Test");
  assert.equal(capturedBody?.resume_content, Buffer.from("pdf-bytes").toString("base64"));
  assert.equal(capturedBody?.resume_content_filename, "cv.pdf");
});

test("submitApplication(): the request body never includes the API key anywhere", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));
  let capturedBodyRaw: string | undefined;

  await withMockedFetch(
    (async (_url: string, init?: RequestInit) => {
      capturedBodyRaw = init?.body as string;
      return { ok: true, json: async () => ({ status: "submitted" }) } as Response;
    }) as typeof fetch,
    async () => {
      await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
    }
  );

  assert.ok(capturedBodyRaw);
  assert.equal(capturedBodyRaw?.includes(FAKE_TEST_API_KEY), false);
});

// ============================================================================
// submitLive(): response -> submitted / manual_required / failed mapping
// ============================================================================

test("submitApplication(): a 2xx response is submitted; the raw body is kept as confirmationDetails, with no guessed externalApplicationId", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => ({ ok: true, status: 200, json: async () => ({ some_field: "some_value" }) })) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, true);
      assert.equal(result.externalApplicationId, undefined);
      assert.deepEqual(result.confirmationDetails, { some_field: "some_value" });
    }
  );
});

test("submitApplication(): a 422 response maps to manual_required, surfacing Greenhouse's own error text", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => ({ ok: false, status: 422, text: async () => "email is invalid" })) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.equal(result.manualRequired, true);
      assert.match(result.errorMessage ?? "", /email is invalid/);
    }
  );
});

test("submitApplication(): a 401 response maps to failed (Sqwer's own credential problem), never manual_required, and never includes the key", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => ({ ok: false, status: 401, text: async () => "" })) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.equal(result.manualRequired, undefined);
      assert.equal((result.errorMessage ?? "").includes(FAKE_TEST_API_KEY), false);
    }
  );
});

test("submitApplication(): a 5xx response maps to failed", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => ({ ok: false, status: 503, text: async () => "" })) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.equal(result.manualRequired, undefined);
    }
  );
});

test("submitApplication(): a thrown network error maps to failed, not a crash", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
      assert.match(result.errorMessage ?? "", /network down/);
    }
  );
});

test("submitApplication(): a 2xx response with an unparseable body is not treated as success", async () => {
  const provider = new GreenhouseApplicationProvider(fakeResolver({ "authorized-test-board": FAKE_TEST_API_KEY }));

  await withMockedFetch(
    (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    })) as unknown as typeof fetch,
    async () => {
      const result = await provider.submitApplication(makeAuthTestJob("authorized-test-board"), makeCandidate());
      assert.equal(result.success, false);
    }
  );
});
