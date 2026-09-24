/**
 * The contract, expressed as DATA rather than as code.
 *
 * The point of keeping it in this shape: somebody who does not write TypeScript
 * can still review what is being asserted, and adding a vendor quirk is a table
 * edit rather than a patch.
 *
 * This is a deliberately small subset of US Core 6.1.0 / USCDI v3, chosen for
 * the elements that actually break in the field. It is not a full validator and
 * does not claim to be one.
 */

export type Cardinality = "1..1" | "1..*" | "0..1" | "0..*";

export interface ElementRule {
  /** Dotted path from the resource root. `[]` marks an array hop. */
  path: string;
  cardinality: Cardinality;
  /** Primitive shape expected at the leaf. */
  type: "string" | "code" | "object" | "array" | "dateTime";
  /** If set, the value must be one of these. */
  valueSet?: string[];
  /** If set, a Coding at this path must use this system. */
  system?: string;
  why?: string;
}

export interface ProfileRule {
  resourceType: string;
  profile: string;
  elements: ElementRule[];
}

export const PROFILES: ProfileRule[] = [
  {
    resourceType: "Patient",
    profile: "us-core-patient",
    elements: [
      { path: "identifier", cardinality: "1..*", type: "array",
        why: "No identifier means no join. This is the element the whole estate hangs on." },
      { path: "identifier[].system", cardinality: "1..1", type: "string",
        why: "An identifier without a system is a number with no meaning." },
      { path: "identifier[].value", cardinality: "1..1", type: "string" },
      { path: "name", cardinality: "1..*", type: "array" },
      { path: "gender", cardinality: "1..1", type: "code",
        valueSet: ["male", "female", "other", "unknown"],
        why: "Vendors have shipped 'M' and 'F' here. The value set is the check." },
    ],
  },
  {
    resourceType: "Encounter",
    profile: "us-core-encounter",
    elements: [
      { path: "status", cardinality: "1..1", type: "code",
        valueSet: ["planned", "arrived", "triaged", "in-progress", "onleave",
                   "finished", "cancelled", "entered-in-error", "unknown"],
        why: "'cancelled' and 'entered-in-error' are the two a reminder pipeline must never ignore." },
      { path: "class", cardinality: "1..1", type: "object",
        system: "http://terminology.hl7.org/CodeSystem/v3-ActCode" },
      { path: "subject.reference", cardinality: "1..1", type: "string",
        why: "An encounter with no subject cannot be attributed to anybody." },
    ],
  },
  {
    resourceType: "Observation",
    profile: "us-core-observation-lab",
    elements: [
      { path: "status", cardinality: "1..1", type: "code",
        valueSet: ["registered", "preliminary", "final", "amended",
                   "corrected", "cancelled", "entered-in-error", "unknown"] },
      { path: "code.coding", cardinality: "1..*", type: "array" },
      { path: "code.coding[].system", cardinality: "1..1", type: "string",
        why: "A code with no system is the single most common cause of a silent mapping failure." },
      { path: "subject.reference", cardinality: "1..1", type: "string" },
    ],
  },
];
