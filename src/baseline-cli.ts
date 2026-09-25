#!/usr/bin/env node
/**
 *   capture a contract from a known-good sample:
 *     node src/baseline-cli.ts capture claims fixtures/proprietary/claims-v1.ndjson > claims.baseline.json
 *
 *   check a later payload against it:
 *     node src/baseline-cli.ts check claims.baseline.json newer.ndjson
 *
 * Exit codes: 0 clean or info only, 1 warnings, 2 a failure. A scheduler can
 * treat 1 as "tell a human" and 2 as "stop the load".
 */
import { readFileSync } from "node:fs";
import { readNdjson } from "./ndjson.ts";
import { capture, compare, worst, type Baseline } from "./baseline.ts";

const [mode, a, b] = process.argv.slice(2);

if (mode === "capture" && a && b) {
  const { resources } = readNdjson(readFileSync(b, "utf8"));
  console.log(JSON.stringify(capture(a, resources), null, 2));
} else if (mode === "check" && a && b) {
  const base: Baseline = JSON.parse(readFileSync(a, "utf8"));
  const { resources } = readNdjson(readFileSync(b, "utf8"));
  const drift = compare(base, resources);
  console.log(`\n  baseline "${base.name}" captured ${base.capturedAt.slice(0,10)} `
            + `from ${base.sampleSize} records, ${base.fields.length} fields`);
  console.log(`  checking ${resources.length} records\n`);
  if (drift.length === 0) console.log("  no drift");
  const icon = { fail: "FAIL", warn: "WARN", info: "info" } as const;
  for (const d of drift) console.log(`  ${icon[d.severity]}  ${d.path.padEnd(28)} ${d.kind.padEnd(16)} ${d.detail}`);
  const w = worst(drift);
  console.log(`\n  worst severity: ${w}`);
  process.exit(w === "fail" ? 2 : w === "warn" ? 1 : 0);
} else {
  console.error("usage: baseline-cli.ts capture <name> <file.ndjson>");
  console.error("       baseline-cli.ts check <baseline.json> <file.ndjson>");
  process.exit(64);
}
