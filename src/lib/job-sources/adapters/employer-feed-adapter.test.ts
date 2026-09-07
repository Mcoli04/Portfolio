import assert from "node:assert/strict";
import test from "node:test";

import { EmployerFeedAdapter } from "./employer-feed-adapter";

test("normalizeJob: published applicationEmail enables the email application channel", () => {
  const adapter = new EmployerFeedAdapter({
    feeds: [{ employerName: "Example Malta Ltd", feedUrl: "https://example.com/jobs.json", format: "json" }],
  });

  const job = adapter.normalizeJob({
    id: "123",
    title: "Software Engineer",
    applicationEmail: "jobs@example.com",
    __employerName: "Example Malta Ltd",
  });

  assert.equal(job.applicationEmail, "jobs@example.com");
  assert.equal(job.applicationMethod, "email");
  assert.equal(job.autoApplySupported, true);
});

test("normalizeJob: missing applicationEmail stays manual", () => {
  const adapter = new EmployerFeedAdapter({
    feeds: [{ employerName: "Example Malta Ltd", feedUrl: "https://example.com/jobs.json", format: "json" }],
  });

  const job = adapter.normalizeJob({
    id: "456",
    title: "Product Manager",
    __employerName: "Example Malta Ltd",
  });

  assert.equal(job.applicationEmail, undefined);
  assert.equal(job.applicationMethod, "manual");
  assert.equal(job.autoApplySupported, false);
});

test("normalizeJob: non-string applicationEmail never enables auto-apply", () => {
  const adapter = new EmployerFeedAdapter({
    feeds: [{ employerName: "Example Malta Ltd", feedUrl: "https://example.com/jobs.json", format: "json" }],
  });

  const job = adapter.normalizeJob({
    id: "789",
    title: "QA Engineer",
    applicationEmail: { unexpected: true },
    __employerName: "Example Malta Ltd",
  });

  assert.equal(job.applicationEmail, undefined);
  assert.equal(job.applicationMethod, "manual");
  assert.equal(job.autoApplySupported, false);
});

test("getApplicationMethod: malformed applicationEmail stays manual", () => {
  const adapter = new EmployerFeedAdapter({
    feeds: [{ employerName: "Example Malta Ltd", feedUrl: "https://example.com/jobs.json", format: "json" }],
  });

  const method = adapter.getApplicationMethod({
    id: "999",
    applicationEmail: { unexpected: true },
  });

  assert.equal(method, "manual");
});
