import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToPlainText } from "./html-to-text";

test("decodes double-encoded Greenhouse HTML into clean plain text", () => {
  // The exact problematic shape reported against the real Betsson job:
  // Greenhouse's content field came back entity-encoded twice.
  const input = "&lt;p&gt;&amp;nbsp;&lt;/p&gt; &lt;p&gt;The Sportsbook Area...&lt;/p&gt;";
  const result = htmlToPlainText(input);

  assert.equal(result, "The Sportsbook Area...");
  assert.ok(!result.includes("<p>"), "no raw <p> tag should survive");
  assert.ok(!/&lt;|&gt;|&amp;|&nbsp;/.test(result), "no leftover HTML entities should survive");
});

test("strips normal (single-encoded) HTML and preserves paragraph spacing", () => {
  const input = "<p>Hello <strong>world</strong></p><p>Second paragraph.</p>";
  assert.equal(htmlToPlainText(input), "Hello world\n\nSecond paragraph.");
});

test("removes script/style content entirely, not just their tags", () => {
  const input = "<p>Safe text</p><script>alert(1)</script><style>.a{color:red}</style>";
  assert.equal(htmlToPlainText(input), "Safe text");
});

test("converts list items into bullet points", () => {
  const input = "<ul><li>One</li><li>Two</li></ul><p>Done</p>";
  assert.equal(htmlToPlainText(input), "• One\n• Two\n\nDone");
});

test("decodes common named and numeric/hex entities", () => {
  const input = "<p>Salary: &euro;40,000 &ndash; &euro;60,000. 2+ years&#8217; experience.</p>";
  assert.equal(htmlToPlainText(input), "Salary: €40,000 – €60,000. 2+ years’ experience.");
});

test("returns empty string for empty input", () => {
  assert.equal(htmlToPlainText(""), "");
});
