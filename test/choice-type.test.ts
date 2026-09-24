import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readNdjson } from "../src/ndjson.ts";
import { checkAll, checkResource } from "../src/assert.ts";

/**
 * Choice types are the thing people forget.
 *
 * `Observation.value[x]` is the actual result of the test, and it arrives under
 * a different key depending on what kind of result it is: valueQuantity for a
 * number with a unit, valueString for free text, valueCodeableConcept for a
 * coded finding. A resolver that only looks for a key called `value` reports a
 * missing required element on a perfectly good record.
 */

test("valueQuantity satisfies value[x]", () => {
  const obs = {
    resourceType: "Observation", id: "o1", status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "4548-4" }] },
    subject: { reference: "Patient/p1" },
    valueQuantity: { value: 7.1, unit: "%" },
  };
  assert.deepEqual(checkResource(obs), []);
});

test("valueString satisfies value[x] too, despite being a primitive", () => {
  const obs = {
    resourceType: "Observation", id: "o2", status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "625-4" }] },
    subject: { reference: "Patient/p1" },
    valueString: "no growth",
  };
  assert.deepEqual(checkResource(obs), []);
});

test("a result that is absent entirely is caught", () => {
  const { resources } = readNdjson(
    readFileSync(new URL("../fixtures/drift/choice-type-missing.ndjson", import.meta.url), "utf8"));
  const v = checkAll(resources);
  assert.ok(v.some((x) => x.path === "value[x]" && x.kind === "missing"),
    `expected a missing value[x], got ${JSON.stringify(v)}`);
});

test("a key that merely starts with 'value' does not count", () => {
  // `valueset` is lowercase after the stem, so it is not a choice variant.
  const obs = {
    resourceType: "Observation", id: "o3", status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "1" }] },
    subject: { reference: "Patient/p1" },
    valueset: "not a result",
  };
  const v = checkResource(obs);
  assert.ok(v.some((x) => x.path === "value[x]" && x.kind === "missing"));
});
