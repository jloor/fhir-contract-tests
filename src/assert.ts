/**
 * The assertion engine.
 *
 * It reports EVERY violation rather than throwing on the first one, because in
 * a real ingest you want the whole picture of what a vendor changed, not the
 * first thing that happened to fail.
 */

import type { Resource } from "./ndjson.ts";
import type { ElementRule, ProfileRule } from "./profile.ts";
import { PROFILES } from "./profile.ts";

export interface Violation {
  resourceType: string;
  id: string;
  path: string;
  kind: "missing" | "empty" | "wrong-type" | "bad-value" | "wrong-system";
  detail: string;
  why?: string;
}

/** Walk a dotted path. `[]` means "every element of this array". */
function resolve(node: unknown, parts: string[]): unknown[] {
  if (parts.length === 0) return [node];
  const [head, ...rest] = parts;
  if (node === null || node === undefined) return [];

  if (head.endsWith("[]")) {
    const key = head.slice(0, -2);
    const arr = (node as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((item) => resolve(item, rest));
  }
  if (typeof node !== "object") return [];
  return resolve((node as Record<string, unknown>)[head], rest);
}

function checkElement(res: Resource, rule: ElementRule): Violation[] {
  const id = String(res.id ?? "(no id)");
  const type = String(res.resourceType ?? "(unknown)");
  const base = { resourceType: type, id, path: rule.path, why: rule.why };

  // For a path containing [], the parent array must exist before we can check leaves.
  const values = resolve(res, rule.path.split("."));
  const required = rule.cardinality.startsWith("1");

  if (values.length === 0) {
    return required
      ? [{ ...base, kind: "missing", detail: `required by ${rule.cardinality}, not present` }]
      : [];
  }

  const out: Violation[] = [];
  for (const v of values) {
    if (v === null || v === undefined) {
      if (required) out.push({ ...base, kind: "missing", detail: "present but null" });
      continue;
    }
    if (rule.type === "array") {
      if (!Array.isArray(v)) out.push({ ...base, kind: "wrong-type", detail: `expected array, got ${typeof v}` });
      else if (required && v.length === 0) out.push({ ...base, kind: "empty", detail: "array is empty" });
      continue;
    }
    if (rule.type === "object") {
      if (typeof v !== "object" || Array.isArray(v)) {
        out.push({ ...base, kind: "wrong-type", detail: `expected object, got ${typeof v}` });
        continue;
      }
      if (rule.system) {
        const sys = (v as Record<string, unknown>).system;
        if (sys !== rule.system) {
          out.push({ ...base, kind: "wrong-system", detail: `expected ${rule.system}, got ${String(sys)}` });
        }
      }
      continue;
    }
    // string, code, dateTime all arrive as JSON strings
    if (typeof v !== "string") {
      out.push({ ...base, kind: "wrong-type", detail: `expected string, got ${typeof v}` });
      continue;
    }
    if (v.trim() === "" && required) {
      out.push({ ...base, kind: "empty", detail: "empty string" });
      continue;
    }
    if (rule.valueSet && !rule.valueSet.includes(v)) {
      out.push({ ...base, kind: "bad-value", detail: `"${v}" is not in the value set` });
    }
  }
  return out;
}

export function checkResource(res: Resource, profiles = PROFILES): Violation[] {
  const profile = profiles.find((p) => p.resourceType === res.resourceType);
  if (!profile) return [];
  return profile.elements.flatMap((rule) => checkElement(res, rule));
}

export function checkAll(resources: Resource[], profiles = PROFILES): Violation[] {
  return resources.flatMap((r) => checkResource(r, profiles));
}

export function format(violations: Violation[]): string {
  if (violations.length === 0) return "no violations";
  return violations
    .map((v) => `  ${v.resourceType}/${v.id}  ${v.path}  [${v.kind}] ${v.detail}` +
                (v.why ? `\n      why it matters: ${v.why}` : ""))
    .join("\n");
}
