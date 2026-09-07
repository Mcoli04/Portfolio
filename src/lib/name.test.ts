import { test } from "node:test";
import assert from "node:assert/strict";
import { splitFullName, joinFullName } from "./name";

test("splitFullName: single word becomes a first name with no last name", () => {
  assert.deepEqual(splitFullName("Maria"), { firstName: "Maria", lastName: "" });
});

test("splitFullName: two words split on the first space", () => {
  assert.deepEqual(splitFullName("Maria Borg"), { firstName: "Maria", lastName: "Borg" });
});

test("splitFullName: extra words all become part of the last name", () => {
  assert.deepEqual(splitFullName("Maria Anne Borg"), { firstName: "Maria", lastName: "Anne Borg" });
});

test("splitFullName: collapses repeated whitespace and trims", () => {
  assert.deepEqual(splitFullName("  Maria   Borg  "), { firstName: "Maria", lastName: "Borg" });
});

test("splitFullName: empty input produces empty fields, never throws", () => {
  assert.deepEqual(splitFullName(""), { firstName: "", lastName: "" });
  assert.deepEqual(splitFullName("   "), { firstName: "", lastName: "" });
});

test("joinFullName: combines first and last with a single space", () => {
  assert.equal(joinFullName("Maria", "Borg"), "Maria Borg");
});

test("joinFullName: omits either side cleanly when only one is present", () => {
  assert.equal(joinFullName("Maria", ""), "Maria");
  assert.equal(joinFullName("", "Borg"), "Borg");
  assert.equal(joinFullName("", ""), "");
});

test("split then join round-trips a simple two-word name", () => {
  const { firstName, lastName } = splitFullName("Maria Borg");
  assert.equal(joinFullName(firstName, lastName), "Maria Borg");
});
