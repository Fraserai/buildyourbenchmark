/**
 * Minimal structured logger. Deliberately has no way to log task content:
 * callers pass identifiers and metadata only, and known sensitive keys are dropped.
 */
const SENSITIVE_KEYS = /^(instructions|input|inputText|prompt|messages|content|output|text|password|apiKey|authorization|token)$/i;

type Meta = Record<string, unknown>;

function clean(meta: Meta = {}): Meta {
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    out[k] = typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v;
  }
  return out;
}

function emit(level: "info" | "warn" | "error", msg: string, meta?: Meta) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...clean(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};
