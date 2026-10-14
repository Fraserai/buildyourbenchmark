/** Display formatting. Shared by server and client components. */

export function nanoToUsd(nano: number): number {
  return nano / 1e9;
}

/** Human-readable USD with precision that scales with magnitude, e.g. $1.24, $0.1812, $0.000412. */
export function formatUsd(nano: number | null | undefined): string {
  if (nano == null) return "—";
  const usd = nano / 1e9;
  if (usd === 0) return "$0.00";
  if (usd >= 100) return `$${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toPrecision(3).replace(/\.?0+$/, "")}`;
}

/** Exact nano-precision USD for tooltips and audit views. */
export function formatUsdExact(nano: number | null | undefined): string {
  if (nano == null) return "—";
  const neg = nano < 0;
  const abs = Math.abs(nano);
  const whole = Math.floor(abs / 1e9);
  const frac = String(abs % 1e9).padStart(9, "0");
  return `${neg ? "-" : ""}$${whole}.${frac} USD`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s === 60 ? `${m + 1}m 0s` : `${m}m ${s}s`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export function formatRate(perMTok: string | null | undefined): string {
  if (perMTok == null) return "—";
  const v = Number(perMTok);
  if (v === 0) return "$0";
  if (v >= 0.1) return `$${v.toFixed(2)}`;
  return `$${Number(v.toPrecision(3))}`;
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return "never";
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return formatDate(ts);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function modelLabel(name: string, variant: string | null | undefined) {
  return variant ? `${name} (${variant})` : name;
}
