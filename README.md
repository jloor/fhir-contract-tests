# fhir-contract-tests

**Contract tests for FHIR payloads arriving from someone else's EHR.**
No dependencies, no install, no network.

```bash
npm test                              # 14 tests, about 200ms
node src/cli.ts path/to/file.ndjson   # exits non-zero if the contract is violated
```

Node 22.6 or newer runs TypeScript directly, so there is nothing to build and nothing to
install. The CI workflow has no install step either.

---

## What this is

A small harness that asserts the **shape** of FHIR resources you receive, and fails loudly
when that shape changes.

It is not a validator. It does not check whether a payload is valid FHIR, and it does not
try to. It checks whether the payload still matches the assumptions your pipeline was
built on, which is a different and usually more urgent question.

The contract lives in [`src/profile.ts`](src/profile.ts) as **data rather than code**: a
table of resource, path, cardinality, type and value set, with a plain sentence on each
rule saying why it is there.

## Who this is for

**Anyone who reads clinical data out of systems they do not control.** Concretely:

- **Data and integration engineers** pulling from more than one EHR, where every vendor
  has its own idea of what an optional field means.
- **Teams consuming Bulk FHIR exports**, where a single bad assumption about NDJSON can
  quietly drop records.
- **Anyone who has been burned by a silent vendor change**, which is most people who have
  done this for a while.

**It is not for EHR vendors certifying their own API.** That is what ONC's
[Inferno](https://inferno-framework.github.io/) is for, and Inferno does it properly.

## What you can use it for

1. **A gate in front of a load.** The CLI exits non-zero, so it drops into a pipeline step
   ahead of the thing that writes to your warehouse. Catch the change before it becomes a
   restatement.
2. **A CI check over captured vendor samples.** Keep one small fixture per vendor. When a
   vendor changes something, the pull request that bumps the fixture is the notification.
3. **Characterising a new vendor before you write transforms.** Run it over a sample
   export and read the violations. That list is your integration backlog.
4. **A regression harness at version bumps.** When a vendor announces a release, run last
   week's fixtures against it.
5. **Documentation that cannot go stale.** A mapping table in a wiki stops being true
   silently. A failing test does not.

---

## Why it exists

A pipeline that reads from someone else's EHR has no control over what arrives. Vendors
change things on their own schedule and do not ask first. The usual defence is a document
describing the mapping, and the problem with a document is that it goes stale quietly.
Nothing tells you when it stopped being true.

A test does. That is the whole argument.

## What it checks

A deliberately small subset of US Core 6.1.0 and USCDI v3, chosen for the elements that
actually break:

| resource | what it asserts | why |
|---|---|---|
| `Patient` | identifier present with a system and value, name, gender in the value set | An identifier with no system is a number with no meaning. Vendors have shipped `F` where `female` was required. |
| `Encounter` | status in the value set, class from the standard code system, a subject reference | `cancelled` and `entered-in-error` are the two statuses a downstream process must never ignore. |
| `Observation` | status, a code with a coding system, a subject reference, and a result under `value[x]` | A code with no system is the most common cause of a silent mapping failure. |

Adding a rule, or a vendor quirk, is an edit to that table rather than a patch to the
engine.

## The part that matters: [`test/drift.test.ts`](test/drift.test.ts)

Every fixture in `fixtures/drift/` is the clean bundle with **exactly one thing changed**,
the way a vendor changes it:

| mutation | what it stands for |
|---|---|
| `female` becomes `F` | a value set narrowed to a local shorthand |
| `identifier` arrives as `[]` | a required array emptied |
| a `code` loses its `system` | a coding that no longer means anything |
| `subject.reference` becomes `subject.ref` | a field renamed |
| a standard code system swapped for a local one | a vendor substituting its own vocabulary |

Each test proves the change is caught. One of them proves something else that matters just
as much: **a single mutation produces a single violation** rather than lighting up every
rule. A report that fails everything is useless at two in the morning.

## Choice types

`Observation.value[x]` is the result of the test, and it arrives under a different key depending on
what kind of result it is: `valueQuantity` for a number with a unit, `valueString` for free text,
`valueCodeableConcept` for a coded finding.

**A resolver that only looks for a key called `value` reports a missing required element on a
perfectly good record.** The path syntax supports `value[x]` directly, and
[`test/choice-type.test.ts`](test/choice-type.test.ts) covers the object variant, the primitive
variant, an absent result, and a near miss that should not count.

## NDJSON handling

Bulk FHIR delivers NDJSON, and the specification is loose about blank lines. ONC's own
Inferno test kit had to allow empty lines because real servers emit them, so a reader that
assumes one JSON object per line and nothing else will throw on a perfectly legal file.

[`src/ndjson.ts`](src/ndjson.ts) tolerates blank lines and a byte order mark, and
**reports unparseable lines rather than dropping them silently**, which is the failure mode
that costs you a week.

## Pointing it at something real

The fixtures are synthetic. The harness is not. `src/cli.ts` takes a file path, so the
upgrade is a configuration change rather than a rewrite: register an application with a
vendor offering a self-serve sandbox, run a `Group/$export`, and run the CLI over whatever
comes back.

## Limits, stated plainly

- A subset of two specifications, not a conformance suite.
- Synthetic fixtures. Nothing here has touched real patient data.
- Value sets are inlined rather than fetched from a terminology server.
- It asserts shape, not clinical correctness. A structurally perfect record can still be wrong.
- Profile slicing and `contained` resources are not addressable in the path syntax.

## License

MIT. See [LICENSE](LICENSE).
