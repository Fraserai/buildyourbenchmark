import crypto from "node:crypto";

/** Sortable, URL-safe identifiers: 12 hex chars of millisecond time + 12 random hex chars, prefixed. */
export function newId(prefix: string): string {
  const time = Date.now().toString(16).padStart(12, "0");
  return `${prefix}_${time}${crypto.randomBytes(6).toString("hex")}`;
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Deterministic JSON (sorted keys) for hashing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
