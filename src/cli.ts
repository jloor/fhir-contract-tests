#!/usr/bin/env node
/**
 * Point it at a real NDJSON file:
 *
 *   node src/cli.ts path/to/Patient.ndjson
 *
 * Exits non-zero when the contract is violated, so it drops straight into CI
 * or into a pipeline step ahead of a load.
 */
import { readFileSync } from "node:fs";
import { readNdjson } from "./ndjson.ts";
import { checkAll, format } from "./assert.ts";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node src/cli.ts <file.ndjson> [...]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const { resources, skipped } = readNdjson(readFileSync(file, "utf8"));
  const violations = checkAll(resources);
  console.log(`\n${file}`);
  console.log(`  ${resources.length} resources read, ${skipped.length} lines skipped`);
  for (const s of skipped) console.log(`  line ${s.line}: ${s.reason}`);
  if (violations.length === 0) {
    console.log("  contract holds");
  } else {
    console.log(`  ${violations.length} violation(s):`);
    console.log(format(violations));
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
