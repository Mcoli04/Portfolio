import assert from "node:assert/strict";
import test from "node:test";

import { CustomEmployerAdapter } from "./custom-employer-adapter";

test("normalizeJob: email method without a published application email stays manual", () => {
  const adapter = new CustomEmployerAdapter({
    integrations: [],
  });

  const job = adapter.normalizeJob({
    id: "123",
    title: "Software Engineer",
    __employerName: "Example Malta Ltd",
    __applicationMethod: "email",
  });

  assert.equal(job.applicationEmail, undefined);
  assert.equal(job.applicationMethod, "manual");
  assert.equal(job.autoApplySupported, false);
});

test("getApplicationMethod: email without a published application email stays manual", () => {
  const adapter = new CustomEmployerAdapter({
    integrations: [],
  });

  const method = adapter.getApplicationMethod({
    id: "123",
    __applicationMethod: "email",
  });

  assert.equal(method, "manual");
});

test("normalizeJob: an unrecognized __applicationMethod value falls back to manual, not a fabricated channel", () => {
  const adapter = new CustomEmployerAdapter({
    integrations: [],
  });

  const job = adapter.normalizeJob({
    id: "456",
    title: "Software Engineer",
    __employerName: "Example Malta Ltd",
    // Not one of "internal" | "email" | "manual" — e.g. a typo made
    // directly against job_sources.config.
    __applicationMethod: "webhook",
  });

  assert.equal(job.applicationMethod, "manual");
  assert.equal(job.autoApplySupported, false);
});

test("getApplicationMethod: an unrecognized __applicationMethod value falls back to manual", () => {
  const adapter = new CustomEmployerAdapter({
    integrations: [],
  });

  const method = adapter.getApplicationMethod({
    id: "456",
    __applicationMethod: "webhook",
  });

  assert.equal(method, "manual");
});

test("getApplicationMethod: a non-string __applicationMethod value falls back to manual", () => {
  const adapter = new CustomEmployerAdapter({
    integrations: [],
  });

  const method = adapter.getApplicationMethod({
    id: "789",
    __applicationMethod: { unexpected: true },
  });

  assert.equal(method, "manual");
});
