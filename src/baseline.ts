/**
 * Baseline mode: contracts for APIs that publish no contract.
 *
 * US Core tells you what a Patient must contain, so `profile.ts` can declare the
 * rules up front. A proprietary billing API tells you nothing. There is no spec,
 * no versioning guarantee and no deprecation policy, and that is exactly where
 * the money lives.
 *
 * So the contract gets CAPTURED instead of declared: take a known-good sample,
 * infer its shape, freeze it, and assert future payloads against it.
 *
 * The important half is severity. A harness that fails on every difference gets
 * muted within a month, and a muted harness catches nothing. A vendor adding a
 * field is normal. A vendor renaming one is an incident.
 */

import type { Resource } from "./ndjson.ts";

export type Severity = "info" | "warn" | "fail";

export interface FieldShape {
  /** Dotted path, with [] for an array hop. */
  path: string;
  /** JSON types seen at this path, sorted. More than one is itself a smell. */
  types: string[];
  /** Fraction of records where the path was present, 0 to 1. */
  presence: number;
  /** Captured only when the field looks enumerated. */
  values?: string[];
}

export interface Baseline {
  name: string;
  capturedAt: string;
  sampleSize: number;
  fields: FieldShape[];
}

export interface Drift {
  path: string;
  severity: Severity;
  kind: "field-added" | "field-removed" | "type-changed" | "became-optional"
      | "became-required" | "new-value" | "value-dropped";
  detail: string;
}

const MAX_ENUM = 12;          // above this it is data, not a value set
const REQUIRED_AT = 0.99;     // present this often in the sample means required
const RARE_AT = 0.01;         // below this we do not trust the observation

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Flatten a record to path -> value pairs, hopping arrays as `field[]`. */
function walk(node: unknown, prefix: string, out: Map<string, unknown[]>): void {
  if (node === null || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      push(out, `${path}[]`, v.length === 0 ? undefined : v[0]);
      for (const item of v) walk(item, `${path}[]`, out);
      push(out, path, v);
    } else {
      push(out, path, v);
      walk(v, path, out);
    }
  }
}
function push(m: Map<string, unknown[]>, k: string, v: unknown) {
  if (v === undefined) return;
  const a = m.get(k); if (a) a.push(v); else m.set(k, [v]);
}

export function capture(name: string, records: Resource[]): Baseline {
  const seen = new Map<string, unknown[]>();
  const present = new Map<string, number>();
  for (const r of records) {
    const one = new Map<string, unknown[]>();
    walk(r, "", one);
    for (const [path, vals] of one) {
      present.set(path, (present.get(path) ?? 0) + 1);
      const a = seen.get(path); if (a) a.push(...vals); else seen.set(path, [...vals]);
    }
  }
  const fields: FieldShape[] = [];
  for (const [path, vals] of [...seen].sort(([a],[b]) => a.localeCompare(b))) {
    const types = [...new Set(vals.map(typeOf))].sort();
    const shape: FieldShape = {
      path,
      types,
      presence: Number(((present.get(path) ?? 0) / records.length).toFixed(4)),
    };
    // A short list of repeated strings is a value set. A long one is just data.
    if (types.length === 1 && types[0] === "string") {
      const distinct = [...new Set(vals as string[])];
      // A single observed value is a constant or an accident of the sample, not
      // a value set. Inferring one from it produces a false positive on the next
      // payload, which is how a useful check becomes a noisy one.
      if (distinct.length >= 2 && distinct.length <= MAX_ENUM
          && distinct.length < vals.length / 2) {
        shape.values = distinct.sort();
      }
    }
    fields.push(shape);
  }
  return { name, capturedAt: new Date().toISOString(), sampleSize: records.length, fields };
}

export function compare(base: Baseline, records: Resource[]): Drift[] {
  const now = capture(base.name, records);
  const nowBy = new Map(now.fields.map(f => [f.path, f]));
  const baseBy = new Map(base.fields.map(f => [f.path, f]));
  const out: Drift[] = [];

  for (const b of base.fields) {
    const n = nowBy.get(b.path);

    if (!n) {
      // A field the baseline always had, now absent entirely.
      out.push({ path: b.path,
        severity: b.presence >= REQUIRED_AT ? "fail" : "warn",
        kind: "field-removed",
        detail: b.presence >= REQUIRED_AT
          ? `was present in ${(b.presence*100).toFixed(0)}% of the baseline, now absent`
          : `was rare in the baseline (${(b.presence*100).toFixed(1)}%) and is now absent` });
      continue;
    }

    const added = n.types.filter(t => !b.types.includes(t) && t !== "null");
    if (added.length) {
      out.push({ path: b.path, severity: "fail", kind: "type-changed",
        detail: `baseline saw ${b.types.join("|")}, now also ${added.join("|")}` });
    }

    if (b.presence >= REQUIRED_AT && n.presence < REQUIRED_AT) {
      out.push({ path: b.path, severity: "fail", kind: "became-optional",
        detail: `${(b.presence*100).toFixed(0)}% -> ${(n.presence*100).toFixed(0)}% present` });
    } else if (b.presence < REQUIRED_AT && n.presence >= REQUIRED_AT && b.presence > RARE_AT) {
      out.push({ path: b.path, severity: "info", kind: "became-required",
        detail: `${(b.presence*100).toFixed(0)}% -> ${(n.presence*100).toFixed(0)}% present` });
    }

    if (b.values && n.values) {
      const fresh = n.values.filter(v => !b.values!.includes(v));
      const gone  = b.values.filter(v => !n.values!.includes(v));
      // A new member of a value set may be a legitimate new state or silent
      // data loss downstream. It warns rather than fails, and a human decides.
      if (fresh.length) out.push({ path: b.path, severity: "warn", kind: "new-value",
        detail: `values not in the baseline: ${fresh.slice(0,5).join(", ")}` });
      if (gone.length) out.push({ path: b.path, severity: "info", kind: "value-dropped",
        detail: `baseline values not seen: ${gone.slice(0,5).join(", ")}` });
    }
  }

  // Additive change is normal and must not fail, or the check gets muted.
  for (const n of now.fields) {
    if (!baseBy.has(n.path)) {
      out.push({ path: n.path, severity: "warn", kind: "field-added",
        detail: `new field, ${n.types.join("|")}, present in ${(n.presence*100).toFixed(0)}%` });
    }
  }

  const rank = { fail: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.path.localeCompare(b.path));
}

export function worst(drift: Drift[]): Severity {
  return drift.some(d => d.severity === "fail") ? "fail"
       : drift.some(d => d.severity === "warn") ? "warn" : "info";
}
