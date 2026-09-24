import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readNdjson } from "../src/ndjson.ts";
import { checkAll, format } from "../src/assert.ts";

const read = (f: string) => readNdjson(readFileSync(new URL(f, import.meta.url), "utf8"));

test("the clean bundle passes every rule", () => {
  const { resources, skipped } = read("../fixtures/bundle.ndjson");
  assert.equal(skipped.length, 0, "no line should be unreadable");
  assert.equal(resources.length, 5);
  const v = checkAll(resources);
  assert.equal(v.length, 0, `expected no violations, got:\n${format(v)}`);
});

test("blank lines in NDJSON are legal and are not errors", () => {
  // The clean fixture deliberately contains blank lines between resources.
  const raw = readFileSync(new URL("../fixtures/bundle.ndjson", import.meta.url), "utf8");
  assert.ok(raw.includes("\n\n"), "fixture should contain a blank line");
  const { resources, skipped } = readNdjson(raw);
  assert.equal(skipped.length, 0);
  assert.equal(resources.length, 5);
});

test("a byte order mark does not break the first resource", () => {
  const raw = "﻿" + readFileSync(new URL("../fixtures/bundle.ndjson", import.meta.url), "utf8");
  const { resources, skipped } = readNdjson(raw);
  assert.equal(skipped.length, 0);
  assert.equal(resources[0].resourceType, "Patient");
});

test("an unparseable line is reported, never silently dropped", () => {
  const { resources, skipped } = read("../fixtures/drift/truncated-line.ndjson");
  assert.equal(resources.length, 0);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, "unparseable JSON");
});
