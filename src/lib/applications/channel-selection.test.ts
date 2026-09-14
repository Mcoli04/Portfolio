import assert from "node:assert/strict";
import test from "node:test";
import { selectChannel } from "./channel-selection";
import type { ApplicationProvider } from "./types";
import type { IntegrationStatus } from "@/lib/types/database";

function fakeProvider(key: string, status: IntegrationStatus): ApplicationProvider {
  return {
    key,
    name: key,
    getStatus: () => status,
  } as unknown as ApplicationProvider;
}

function getProviderFrom(providers: Record<string, ApplicationProvider>) {
  return (key: string) => providers[key] ?? null;
}

test("selectChannel: a live email provider does NOT win when the job's URL is on an allowlisted browser-automation domain (precedence regression)", () => {
  const getProvider = getProviderFrom({
    email: fakeProvider("email", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "email",
      applicationProvider: null,
      applicationEmail: "jobs@employer.example",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: ["boards.greenhouse.io"] }
  );

  assert.equal(selection.kind, "browser_automation");
});

test("selectChannel: an allowlisted browser-automation domain never falls through to email, even if the browser_automation provider lookup itself comes back empty", () => {
  // Regression test for the exact original bug: getProvider here reports a
  // live email provider but does NOT register "browser_automation" at all
  // (getProviderFrom returns null for any unlisted key) — this must still
  // stop at the browser-automation branch (kind "none", since the
  // provider lookup failed) and must NEVER fall through to select the
  // live email provider instead. This mirrors the original selectProvider()'s
  // unconditional `return getApplicationProvider("browser_automation")`,
  // which never fell through to email regardless of that lookup's result.
  const getProvider = getProviderFrom({
    email: fakeProvider("email", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "email",
      applicationProvider: null,
      applicationEmail: "jobs@employer.example",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: ["boards.greenhouse.io"] }
  );

  assert.equal(selection.kind, "none");
  assert.notEqual(selection.kind, "provider");
});

test("selectChannel: the same live email provider DOES win when there's no allowlisted domain in the way", () => {
  const getProvider = getProviderFrom({
    email: fakeProvider("email", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "email",
      applicationProvider: null,
      applicationEmail: "jobs@employer.example",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: [] }
  );

  assert.equal(selection.kind, "provider");
  if (selection.kind === "provider") assert.equal(selection.provider.key, "email");
});

test("selectChannel: a live ATS provider wins even with an allowlisted domain present, since api/ats is checked before browser automation", () => {
  const getProvider = getProviderFrom({
    greenhouse: fakeProvider("greenhouse", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationEmail: null,
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: ["boards.greenhouse.io"] }
  );

  assert.equal(selection.kind, "provider");
  if (selection.kind === "provider") assert.equal(selection.provider.key, "greenhouse");
});

test("selectChannel: a live internal provider wins even with an allowlisted domain present, since internal is checked before browser automation", () => {
  const getProvider = getProviderFrom({
    employer_integration: fakeProvider("employer_integration", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "internal",
      applicationProvider: null,
      applicationEmail: null,
      applicationUrl: "https://apply.example.com/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: ["apply.example.com"] }
  );

  assert.equal(selection.kind, "provider");
  if (selection.kind === "provider") assert.equal(selection.provider.key, "employer_integration");
});

test("selectChannel: demo source always resolves to the internal sandbox, regardless of method/provider/email/url", () => {
  const getProvider = getProviderFrom({
    internal: fakeProvider("internal", "DEMO"),
  });

  const selection = selectChannel(
    {
      isDemoSource: true,
      applicationMethod: "manual",
      applicationProvider: null,
      applicationEmail: null,
      applicationUrl: null,
    },
    { getProvider }
  );

  assert.equal(selection.kind, "demo");
  if (selection.kind === "demo") assert.equal(selection.provider.key, "internal");
});

test("selectChannel: nothing live and no domain match resolves to none (the real default env state)", () => {
  const selection = selectChannel({
    isDemoSource: false,
    applicationMethod: "ats",
    applicationProvider: "greenhouse",
    applicationEmail: null,
    applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
  });

  assert.equal(selection.kind, "none");
});

// ============================================================================
// isJobEligible: per-job refinement on top of provider.getStatus() === "LIVE"
// (Greenhouse's per-board authorization is the first real consumer of this.)
// ============================================================================

function fakeProviderWithEligibility(
  key: string,
  status: IntegrationStatus,
  isJobEligible: (job: { applicationUrl: string | null | undefined }) => boolean
): ApplicationProvider {
  return {
    key,
    name: key,
    getStatus: () => status,
    isJobEligible,
  } as unknown as ApplicationProvider;
}

test("selectChannel: a LIVE provider is NOT selected for a job its own isJobEligible() rejects", () => {
  const getProvider = getProviderFrom({
    greenhouse: fakeProviderWithEligibility("greenhouse", "LIVE", () => false),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationEmail: null,
      applicationUrl: "https://job-boards.greenhouse.io/unauthorized-board/jobs/1",
    },
    { getProvider }
  );

  assert.equal(selection.kind, "none");
});

test("selectChannel: a LIVE provider IS selected for a job its own isJobEligible() accepts", () => {
  const getProvider = getProviderFrom({
    greenhouse: fakeProviderWithEligibility("greenhouse", "LIVE", (job) => job.applicationUrl?.includes("authorized-board") ?? false),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationEmail: null,
      applicationUrl: "https://job-boards.greenhouse.io/authorized-board/jobs/1",
    },
    { getProvider }
  );

  assert.equal(selection.kind, "provider");
});

test("selectChannel: a LIVE provider with no isJobEligible at all defaults to eligible (every provider except Greenhouse is unaffected)", () => {
  const getProvider = getProviderFrom({
    lever: fakeProvider("lever", "LIVE"),
  });

  const selection = selectChannel(
    {
      isDemoSource: false,
      applicationMethod: "ats",
      applicationProvider: "lever",
      applicationEmail: null,
      applicationUrl: "https://jobs.lever.co/some-employer/1",
    },
    { getProvider }
  );

  assert.equal(selection.kind, "provider");
});
