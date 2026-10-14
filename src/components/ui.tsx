import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="2" y="9" width="4.5" height="11" rx="2.25" fill="var(--color-price)" />
        <rect x="8.75" y="4" width="4.5" height="16" rx="2.25" fill="var(--color-time)" />
        <rect x="15.5" y="1" width="4.5" height="19" rx="2.25" fill="var(--color-output)" />
      </svg>
      <span className={cx("text-[15px] font-semibold tracking-tight text-white", compact && "hidden sm:inline")}>Workbench</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger";
const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/15 whitespace-nowrap";
const buttonVariants: Record<Variant, string> = {
  primary: "bg-white text-ink-950 hover:bg-white/90 shadow-[0_8px_24px_-10px_rgba(255,255,255,0.45)] px-4 h-10",
  secondary: "border border-line bg-white/[0.04] text-fg hover:bg-white/[0.08] hover:border-line-strong px-4 h-10",
  ghost: "text-muted hover:text-fg hover:bg-white/[0.05] px-3 h-9",
  danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15 px-4 h-10",
};

export function buttonClass(variant: Variant = "primary", extra?: string) {
  return cx(buttonBase, buttonVariants[variant], extra);
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-3">{eyebrow}</div>}
        <h1 className="display text-4xl leading-[1.05] text-white md:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("panel", className)} {...props} />;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="panel-flat flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <div className="text-[15px] font-medium text-fg">{title}</div>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges & status
// ---------------------------------------------------------------------------

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "price" | "time" | "output" | "demo" | "danger" | "ok"; className?: string; title?: string }) {
  const tones = {
    neutral: "border-line text-muted bg-white/[0.03]",
    price: "border-price/25 text-price bg-price/10",
    time: "border-time/25 text-time bg-time/10",
    output: "border-output/25 text-output bg-output/10",
    demo: "border-demo/30 text-demo bg-demo/10",
    danger: "border-danger/30 text-danger bg-danger/10",
    ok: "border-ok/25 text-ok bg-ok/10",
  } as const;
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: "neutral" | "time" | "ok" | "danger" | "demo"; live?: boolean }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "time", live: true },
  completed: { label: "Complete", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  partial: { label: "Partial", tone: "demo" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return (
    <Badge tone={s.tone}>
      <span className={cx("h-1.5 w-1.5 rounded-full bg-current", s.live && "pulse-dot")} />
      {s.label}
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: "live" | "demo" }) {
  return mode === "demo" ? (
    <Badge tone="demo" title="Simulated — no model was called. Not a measurement.">
      Demo · simulated
    </Badge>
  ) : (
    <Badge tone="ok" title="Real provider calls. Measured price, time and output.">
      Live
    </Badge>
  );
}

export function ProviderDot({ color, className }: { color: string; className?: string }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/40", className)} style={{ background: color }} />;
}

export function ModelName({ name, variant, color, className }: { name: string; variant?: string | null; color: string; className?: string }) {
  return (
    <span className={cx("flex min-w-0 max-w-full items-center gap-2.5", className)}>
      <ProviderDot color={color} />
      <span className="truncate font-medium text-fg">{name}</span>
      {variant && <span className="truncate text-xs text-faint">{variant}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <div role={state.error ? "alert" : "status"} className={cx("rounded-xl border px-3.5 py-2.5 text-sm", state.error ? "border-danger/30 bg-danger/10 text-danger" : "border-ok/25 bg-ok/10 text-ok")}>
      {state.error ?? state.ok}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Measurement primitives: PRICE · TIME · OUTPUT
// ---------------------------------------------------------------------------

export const MEASURE = {
  price: { label: "Price", color: "text-price", bg: "bg-price" },
  time: { label: "Time", color: "text-time", bg: "bg-time" },
  output: { label: "Output", color: "text-output", bg: "bg-output" },
} as const;

export function Metric({ kind, value, sub, title, size = "lg" }: { kind: keyof typeof MEASURE; value: ReactNode; sub?: ReactNode; title?: string; size?: "lg" | "md" | "sm" }) {
  const m = MEASURE[kind];
  return (
    <div className="min-w-0" title={title}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cx("h-1.5 w-1.5 rounded-full", m.bg)} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{m.label}</span>
      </div>
      <div className={cx("num font-medium text-white", size === "lg" ? "text-[28px] leading-none" : size === "md" ? "text-xl leading-none" : "text-[15px]")}>{value}</div>
      {sub && <div className="mt-1.5 truncate text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

export function Icon({ name, className }: { name: "plus" | "arrow" | "play" | "search" | "file" | "x" | "check" | "copy" | "download" | "columns" | "clock" | "coin" | "doc" | "spark" | "chevron" | "upload" | "refresh" | "layers" | "users"; className?: string }) {
  const p: Record<string, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    play: <path d="M7 5l12 7-12 7V5z" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
    file: <><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5" /></>,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></>,
    download: <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" />,
    columns: <><rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="16" rx="1.5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    coin: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2-.4-2.5-1.2M12 6.5v11" /></>,
    doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7M9 7h4" /></>,
    spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />,
    chevron: <path d="M9 6l6 6-6 6" />,
    upload: <path d="M12 20V9m0 0l-4.5 4.5M12 9l4.5 4.5M5 4h14" />,
    refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />,
    layers: <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={cx("h-4 w-4 shrink-0", className)} aria-hidden>
      {p[name]}
    </svg>
  );
}
