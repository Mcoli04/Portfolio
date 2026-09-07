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
