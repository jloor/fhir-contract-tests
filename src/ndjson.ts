/**
 * Bulk FHIR delivers NDJSON, one resource per line.
 *
 * The spec is loose about blank lines, and ONC's own Inferno test kit had to
 * allow empty lines because real servers emit them. A reader that assumes one
 * JSON object per line and nothing else will throw on a perfectly legal file.
 */

export type Resource = Record<string, unknown> & { resourceType?: string };

export interface ReadResult {
  resources: Resource[];
  /** Lines that were skipped, with the reason. Never silently dropped. */
  skipped: { line: number; reason: string }[];
}

export function readNdjson(text: string): ReadResult {
  const resources: Resource[] = [];
  const skipped: { line: number; reason: string }[] = [];

  // Strip a UTF-8 byte order mark. Some servers include one.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  body.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "") return; // legal, and not an error
    try {
      const parsed = JSON.parse(line) as Resource;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        skipped.push({ line: i + 1, reason: "not a JSON object" });
        return;
      }
      resources.push(parsed);
    } catch {
      skipped.push({ line: i + 1, reason: "unparseable JSON" });
    }
  });

  return { resources, skipped };
}
