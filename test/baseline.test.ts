import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readNdjson } from "../src/ndjson.ts";
import { capture, compare, worst } from "../src/baseline.ts";

/**
 * Baseline mode exists for APIs that publish no contract. The rules are
 * captured from a known-good sample rather than declared, so the tests are
 * about the INFERENCE being sound and the severities being useful.
 */

const load = (f: string) =>
  readNdjson(readFileSync(new URL(`../fixtures/proprietary/${f}`, import.meta.url), "utf8")).resources;

const v1 = load("claims-v1.ndjson");
const v2 = load("claims-v2-drifted.ndjson");

test("capture records presence as a fraction of the sample", () => {
  const b = capture("claims", v1);
  const id = b.fields.find(f => f.path === "claimid")!;
  assert.equal(id.presence, 1);
  const mod = b.fields.find(f => f.path === "modifier1")!;
  assert.equal(mod.presence, 0.4, "modifier1 appears in 2 of 5 records");
});

test("a field seen with one value is NOT inferred as a value set", () => {
  // Otherwise a constant in the sample becomes a rule, and the next payload
  // fails for no reason. That is how a useful check becomes a muted one.
  const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i), region: "US" }));
  const b = capture("t", rows);
  assert.equal(b.fields.find(f => f.path === "region")!.values, undefined);
});

test("a repeated short list IS inferred as a value set", () => {
  const rows = Array.from({ length: 50 }, (_, i) =>
    ({ id: String(i), status: ["OPEN", "CLOSED", "HELD"][i % 3] }));
  const b = capture("t", rows);
  assert.deepEqual(b.fields.find(f => f.path === "status")!.values, ["CLOSED", "HELD", "OPEN"]);
});

test("comparing a baseline to itself finds no drift", () => {
  assert.deepEqual(compare(capture("claims", v1), v1), []);
});

test("a type change FAILS", () => {
  const d = compare(capture("claims", v1), v2);
  const t = d.find(x => x.path === "chargeamount" && x.kind === "type-changed");
  assert.ok(t, "string to number on a money field must be caught");
  assert.equal(t!.severity, "fail");
});

test("a removed required field FAILS", () => {
  const d = compare(capture("claims", v1), v2);
  const r = d.find(x => x.path === "primaryinsuranceid" && x.kind === "field-removed");
  assert.equal(r!.severity, "fail");
});

test("an added field WARNS rather than failing", () => {
  // Vendors add fields constantly. Failing on it trains people to ignore the check.
  const d = compare(capture("claims", v1), v2);
  const a = d.find(x => x.path === "payerclassification" && x.kind === "field-added");
  assert.equal(a!.severity, "warn");
});

test("a rename shows up as a removal plus an addition", () => {
  // No tool can know the two are the same field. Surfacing both next to each
  // other is what lets a human recognise it in one glance.
  const d = compare(capture("claims", v1), v2);
  assert.ok(d.some(x => x.path === "primaryinsuranceid" && x.kind === "field-removed"));
  assert.ok(d.some(x => x.path === "primaryinsurancePackageId" && x.kind === "field-added"));
});

test("an unannounced new value in a value set WARNS", () => {
  const base = capture("claims", load("claims-v1-large.ndjson"));
  const d = compare(base, load("claims-v2-newstatus.ndjson"));
  const nv = d.find(x => x.path === "claimstatus" && x.kind === "new-value");
  assert.ok(nv, "a status nobody mentioned must surface");
  assert.equal(nv!.severity, "warn");
  assert.match(nv!.detail, /HOLD/);
});

test("worst severity drives the exit code", () => {
  assert.equal(worst(compare(capture("claims", v1), v2)), "fail");
  assert.equal(worst([]), "info");
});
