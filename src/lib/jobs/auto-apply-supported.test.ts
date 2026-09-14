import assert from "node:assert/strict";
import test from "node:test";
import { computeAutoApplySupported, resolveAutoApplySupported } from "./auto-apply-supported";
import type { ApplicationProvider } from "@/lib/applications/types";
import type { IntegrationStatus } from "@/lib/types/database";

function fakeProvider(
  key: string,
  status: IntegrationStatus,
  isJobEligible?: (job: { applicationUrl: string | null | undefined }) => boolean
): ApplicationProvider {
  return {
    key,
    name: key,
    getStatus: () => status,
    isJobEligible,
  } as unknown as ApplicationProvider;
}

function getProviderFrom(providers: Record<string, ApplicationProvider>) {
  return (key: string) => providers[key] ?? null;
}

test("computeAutoApplySupported: false when a live email provider is preempted by an allowlisted browser-automation domain (precedence regression)", () => {
  const getProvider = getProviderFrom({
    email: fakeProvider("email", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });

  const result = computeAutoApplySupported(
    {
      applicationMethod: "email",
      applicationEmail: "jobs@employer.example",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: ["boards.greenhouse.io"] }
  );

  assert.equal(result, false);
});

test("computeAutoApplySupported: true for the same live email provider once nothing preempts it", () => {
  const getProvider = getProviderFrom({
    email: fakeProvider("email", "LIVE"),
  });

  const result = computeAutoApplySupported(
    {
      applicationMethod: "email",
      applicationEmail: "jobs@employer.example",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider, browserAutomationAllowedDomains: [] }
  );

  assert.equal(result, true);
});

test("computeAutoApplySupported: true for a live ATS/internal provider even with an allowlisted domain present (checked before browser automation)", () => {
  const getProviderAts = getProviderFrom({
    greenhouse: fakeProvider("greenhouse", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });
  const atsResult = computeAutoApplySupported(
    {
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationUrl: "https://boards.greenhouse.io/employer/jobs/123",
    },
    { getProvider: getProviderAts, browserAutomationAllowedDomains: ["boards.greenhouse.io"] }
  );
  assert.equal(atsResult, true);

  const getProviderInternal = getProviderFrom({
    employer_integration: fakeProvider("employer_integration", "LIVE"),
    browser_automation: fakeProvider("browser_automation", "LIVE"),
  });
  const internalResult = computeAutoApplySupported(
    {
      applicationMethod: "internal",
      applicationUrl: "https://apply.example.com/jobs/123",
    },
    { getProvider: getProviderInternal, browserAutomationAllowedDomains: ["apply.example.com"] }
  );
  assert.equal(internalResult, true);
});

test("computeAutoApplySupported: false for every method against the real (unconfigured) registry — the actual default state", () => {
  assert.equal(computeAutoApplySupported({ applicationMethod: "manual" }), false);
  assert.equal(computeAutoApplySupported({ applicationMethod: "ats", applicationProvider: "greenhouse" }), false);
  assert.equal(computeAutoApplySupported({ applicationMethod: "internal" }), false);
  assert.equal(computeAutoApplySupported({ applicationMethod: "email", applicationEmail: "jobs@employer.example" }), false);
  assert.equal(computeAutoApplySupported({ applicationMethod: "email" }), false);
});

test("resolveAutoApplySupported: demo source passes the adapter's own value through unchanged, both true and false", () => {
  assert.equal(
    resolveAutoApplySupported("demo", { applicationMethod: "ats", applicationProvider: "greenhouse", autoApplySupported: true }),
    true
  );
  assert.equal(
    resolveAutoApplySupported("demo", { applicationMethod: "manual", autoApplySupported: false }),
    false
  );
});

test("resolveAutoApplySupported: a non-demo source's claimed value is overridden by the real computation", () => {
  // The original bug: an adapter claiming autoApplySupported: true for a
  // provider (greenhouse) that is actually NOT_CONFIGURED in the real
  // registry must not be trusted.
  const result = resolveAutoApplySupported("greenhouse", {
    applicationMethod: "ats",
    applicationProvider: "greenhouse",
    autoApplySupported: true,
  });

  assert.equal(result, false);
});

test("computeAutoApplySupported: stays board-accurate, not provider-wide — an authorized board is true, an unauthorized board on the SAME provider key is false", () => {
  // Regression test for Greenhouse's per-board authorization: once any one
  // board is authorized, the provider key ("greenhouse") reports LIVE
  // provider-wide, but auto_apply_supported must still reflect the SPECIFIC
  // job's own board via isJobEligible(), not just the coarse provider status.
  const getProvider = getProviderFrom({
    greenhouse: fakeProvider("greenhouse", "LIVE", (job) => job.applicationUrl?.includes("authorized-board") ?? false),
  });

  const authorizedBoardResult = computeAutoApplySupported(
    {
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationUrl: "https://job-boards.greenhouse.io/authorized-board/jobs/1",
    },
    { getProvider }
  );
  assert.equal(authorizedBoardResult, true);

  const unauthorizedBoardResult = computeAutoApplySupported(
    {
      applicationMethod: "ats",
      applicationProvider: "greenhouse",
      applicationUrl: "https://job-boards.greenhouse.io/some-other-board/jobs/2",
    },
    { getProvider }
  );
  assert.equal(unauthorizedBoardResult, false);
});
