import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readNdjson } from "../src/ndjson.ts";
import { checkAll, type Violation } from "../src/assert.ts";

/**
 * The point of the whole exercise.
 *
 * Each fixture below is the clean bundle with exactly ONE thing changed, the way
 * a vendor changes it: a value set narrowed, a required element emptied, a field
 * renamed, a coding system swapped for a local one.
 *
 * A wiki page describing the mapping would not notice any of these. A test does.
 */

const drift = (f: string): Violation[] =>
  checkAll(readNdjson(readFileSync(new URL(`../fixtures/drift/${f}`, import.meta.url), "utf8")).resources);

const cases: [string, string, (v: Violation[]) => boolean][] = [
  ["gender-shorthand.ndjson", "a vendor ships 'F' instead of 'female'",
    (v) => v.some((x) => x.path === "gender" && x.kind === "bad-value")],
  ["identifier-emptied.ndjson", "the identifier array arrives empty",
    (v) => v.some((x) => x.path === "identifier" && x.kind === "empty")],
  ["code-system-dropped.ndjson", "a code loses its system and becomes meaningless",
    (v) => v.some((x) => x.path === "code.coding[].system" && x.kind === "missing")],
  ["field-renamed.ndjson", "subject.reference is renamed to subject.ref",
    (v) => v.some((x) => x.path === "subject.reference" && x.kind === "missing")],
  ["system-swapped.ndjson", "a standard code system is replaced by a local one",
    (v) => v.some((x) => x.path === "class" && x.kind === "wrong-system")],
];

for (const [file, description, matches] of cases) {
  test(`drift detected: ${description}`, () => {
    const v = drift(file);
    assert.ok(v.length > 0, "the mutation should produce at least one violation");
    assert.ok(matches(v), `expected a violation for this mutation, got: ${JSON.stringify(v, null, 2)}`);
  });
}

test("one mutation produces a focused failure, not a cascade", () => {
  // A good contract test points at the thing that changed. If every mutation
  // lit up every rule, the report would be useless during an incident.
  const v = drift("gender-shorthand.ndjson");
  assert.equal(v.length, 1, `expected exactly one violation, got ${v.length}`);
  assert.equal(v[0].path, "gender");
});
