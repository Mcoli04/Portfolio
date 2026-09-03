import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationChannelLabel } from "./method-label";

test("a manual_required Greenhouse application never shows a raw/automated-sounding provider label", () => {
  // The exact reported bug: a Greenhouse job resolved to manual_required
  // (no verified submission provider), but the row still carried a stale
  // application_provider of "browser_automation" from an earlier attempt
  // made before that channel was gated behind a domain allowlist.
  const label = applicationChannelLabel({
    status: "manual_required",
    application_method: "ats",
    application_provider: "browser_automation",
  });
  assert.equal(label, "Manual");
  assert.ok(!label.includes("_"), "label must never contain an underscore");
  assert.notEqual(label.toLowerCase(), "browser_automation");
});

test("manual_required always shows Manual regardless of method/provider", () => {
  assert.equal(applicationChannelLabel({ status: "manual_required", application_method: "manual", application_provider: null }), "Manual");
  assert.equal(applicationChannelLabel({ status: "manual_required", application_method: "email", application_provider: "email" }), "Manual");
});

test("a confirmed provider on a non-manual_required application shows its friendly name", () => {
  assert.equal(applicationChannelLabel({ status: "submitted", application_method: "ats", application_provider: "greenhouse" }), "Greenhouse");
  assert.equal(applicationChannelLabel({ status: "submitted", application_method: "email", application_provider: "email" }), "Email");
  assert.equal(applicationChannelLabel({ status: "applying", application_method: "internal", application_provider: "internal" }), "Sqwer");
});

test("no known provider falls back to a friendly method label, never the raw enum value", () => {
  const label = applicationChannelLabel({ status: "applying", application_method: "ats", application_provider: null });
  assert.equal(label, "Company website");
  assert.ok(!label.includes("_"));
});

test("labels never contain underscores or raw internal keys for any known status/method/provider combination", () => {
  const statuses = ["interested", "queued", "applying", "submitted", "failed", "manual_required"] as const;
  const methods = ["api", "ats", "browser_automation", "email", "internal", "manual"] as const;
  const providers = [null, "greenhouse", "lever", "workable", "smartrecruiters", "ashby", "internal", "employer_integration", "email", "browser_automation"];

  for (const status of statuses) {
    for (const application_method of methods) {
      for (const application_provider of providers) {
        const label = applicationChannelLabel({ status, application_method, application_provider });
        assert.ok(typeof label === "string" && label.length > 0);
        assert.ok(!label.includes("_"), `label "${label}" for ${status}/${application_method}/${application_provider} contains an underscore`);
      }
    }
  }
});
