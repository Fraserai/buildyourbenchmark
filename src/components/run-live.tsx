"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { RunView } from "@/server/runs/service";
import { CostBar } from "./cost-bar";
import { CopyButton, OutputBody, OutputModal, fetchArtifact } from "./output-view";
import { Badge, Icon, Metric, ModelName, StatusPill, buttonClass, cx } from "./ui";
import { formatDuration, formatTokens, formatUsd, formatUsdExact } from "@/lib/format";

type RM = RunView["models"][number];
const ACTIVE = new Set(["queued", "running"]);

const PROVIDER_LABEL: Record<string, string> = { openrouter: "OpenRouter", anthropic: "Anthropic API", demo: "Demo (simulated)" };

const COST_SOURCE: Record<string, string> = {
  provider_billed: "billed by provider",
  calculated: "calculated from usage",
  simulated: "simulated",
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function RunLive({ initial }: { initial: RunView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [layout, setLayout] = useState<"cards" | "table">(initial.models.length > 6 ? "table" : "cards");
  const [order, setOrder] = useState<"selected" | "price" | "time">("selected");
  const active = view.models.some((m) => ACTIVE.has(m.status));
  const now = useNow(active);

  useEffect(() => {
    if (!ACTIVE.has(view.run.status) && !active) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/runs/${view.run.id}`, { cache: "no-store" });
        if (res.ok && !stop) {
          const next: RunView = await res.json();
          setView(next);
          if (!ACTIVE.has(next.run.status) && !next.models.some((m) => ACTIVE.has(m.status))) router.refresh();
        }
      } catch {
        /* transient; keep polling */
      }
    };
    const t = setInterval(poll, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [view.run.id, view.run.status, active, router]);

  const models = useMemo(() => {
    const list = [...view.models];
    if (order === "price") list.sort((a, b) => (a.costNanoUsd ?? Infinity) - (b.costNanoUsd ?? Infinity));
    if (order === "time") list.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
    return list;
  }, [view.models, order]);

  const done = view.models.filter((m) => m.status === "completed");
  const total = done.reduce((n, m) => n + (m.costNanoUsd ?? 0), 0);
  const demo = view.run.mode === "demo";
  const opened = view.models.find((m) => m.artifact?.id === openId);
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const compareHref = `/runs/${view.run.id}/compare${compare.length >= 2 ? `?m=${compare.join(",")}` : ""}`;
  const elapsed = view.run.startedAt ? (view.run.completedAt ?? now) - view.run.startedAt : null;

  return (
    <div>
      {/* Summary strip */}
      <div className="panel mb-6 grid grid-cols-2 gap-px overflow-hidden !bg-line md:grid-cols-4">
        <div className="bg-ink-950/85 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill status={view.run.status} />
          </div>
          <div className="mt-2 text-xs text-faint">
            {done.length} of {view.models.length} complete
          </div>
        </div>
        <div className="bg-ink-950/85 p-5">
          <Metric kind="price" size="md" value={formatUsd(total)} sub={demo ? "simulated · not a measurement" : "total across completed models"} title={formatUsdExact(total)} />
        </div>
        <div className="bg-ink-950/85 p-5">
          <Metric kind="time" size="md" value={formatDuration(elapsed)} sub="run wall-clock, models in parallel" />
        </div>
        <div className="bg-ink-950/85 p-5">
          <Metric kind="output" size="md" value={`${done.length} artifact${done.length === 1 ? "" : "s"}`} sub="exact outputs, stored permanently" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={compareHref} className={buttonClass("secondary", cx("h-9", done.length < 2 && "pointer-events-none opacity-40"))}>
          <Icon name="columns" /> {compare.length >= 2 ? `Compare ${compare.length} outputs` : "Compare outputs"}
        </Link>
        {compare.length > 0 && (
          <button onClick={() => setCompare([])} className="text-xs text-faint hover:text-fg">
            Clear selection
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)} className="field h-9 w-auto py-1 text-xs" aria-label="Order">
            <option value="selected">Order selected</option>
            <option value="price">Order by price</option>
            <option value="time">Order by time</option>
          </select>
          <div className="flex rounded-lg border border-line bg-black/20 p-0.5 text-xs">
            {(["cards", "table"] as const).map((l) => (
              <button key={l} onClick={() => setLayout(l)} className={cx("rounded-md px-2.5 py-1.5 capitalize", layout === l ? "bg-white/10 text-white" : "text-muted hover:text-fg")}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {layout === "cards" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {models.map((m) => (
            <ModelCard key={m.id} m={m} now={now} demo={demo} onOpen={() => m.artifact && setOpenId(m.artifact.id)} selected={compare.includes(m.id)} onToggle={() => toggleCompare(m.id)} />
          ))}
        </div>
      ) : (
        <ModelTable models={models} now={now} onOpen={(id) => setOpenId(id)} compare={compare} onToggle={toggleCompare} />
      )}

      {opened?.artifact && (
        <OutputModal
          artifactId={opened.artifact.id}
          title={
            <span className="flex items-center gap-2">
              <ModelName name={opened.modelName} variant={opened.modelVariant} color={opened.providerColor} />
            </span>
          }
          subtitle={`${formatUsd(opened.costNanoUsd)} · ${formatDuration(opened.durationMs)} · ${formatTokens(opened.outputTokens)} output tokens${demo ? " · simulated" : ""}`}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function ModelCard({ m, now, demo, onOpen, selected, onToggle }: { m: RM; now: number; demo: boolean; onOpen: () => void; selected: boolean; onToggle: () => void }) {
  const running = m.status === "running";
  const liveMs = running && m.startedAt ? now - m.startedAt : null;
  return (
    <article className={cx("panel rise flex flex-col overflow-hidden transition-shadow", selected && "ring-1 ring-output/50")}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <ModelName name={m.modelName} variant={m.modelVariant} color={m.providerColor} className="text-[15px]" />
          <div className="ml-5 mt-1 text-xs text-faint">
            {m.providerName} · via {PROVIDER_LABEL[m.inferenceProvider] ?? m.inferenceProvider}
          </div>
        </div>
        <StatusPill status={m.status} />
      </header>

      {m.status === "failed" || m.status === "cancelled" ? (
        <div className="m-5 rounded-xl border border-danger/25 bg-danger/[0.06] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-danger">{m.status === "failed" ? "Error" : "Cancelled"}</div>
          <p className="mt-1.5 break-words text-sm text-fg/90">{m.errorMessage ?? "No details."}</p>
          {m.errorCode && <div className="num mt-2 text-[11px] text-faint">{m.errorCode}{m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}</div>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 px-5 pt-5">
            <Metric
              kind="price"
              value={m.status === "completed" ? formatUsd(m.costNanoUsd) : <span className="text-faint">—</span>}
              sub={m.costSource ? COST_SOURCE[m.costSource] : m.status === "queued" ? "queued" : "measuring"}
              title={m.costNanoUsd != null ? formatUsdExact(m.costNanoUsd) : undefined}
            />
            <Metric
              kind="time"
              value={m.status === "completed" ? formatDuration(m.durationMs) : liveMs != null ? <span className="text-time">{formatDuration(liveMs)}</span> : <span className="text-faint">—</span>}
              sub={m.status === "completed" && m.timeToFirstTokenMs != null ? `first token ${formatDuration(m.timeToFirstTokenMs)}` : running ? "elapsed" : undefined}
            />
            <Metric
              kind="output"
              value={m.status === "completed" ? formatTokens(m.outputTokens) : <span className="text-faint">—</span>}
              sub={m.status === "completed" ? `tokens${m.reasoningTokens ? ` · ${formatTokens(m.reasoningTokens)} reasoning` : ""}` : undefined}
            />
          </div>
          {m.status === "completed" && (
            <div className="px-5 pt-4">
              <CostBar breakdown={m.costBreakdown} />
            </div>
          )}
          <div className="relative mx-5 mt-4 flex-1 overflow-hidden rounded-xl border border-line bg-black/25">
            {m.status === "completed" && m.artifact ? (
              <button onClick={onOpen} className="block max-h-[260px] w-full overflow-hidden p-4 text-left">
                <OutputBody content={m.artifact.preview} type={m.artifact.artifactType} />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-ink-900 to-transparent" />
              </button>
            ) : (
              <div className="space-y-2.5 p-4">
                {[92, 78, 85, 60].map((w, i) => (
                  <div key={i} className={cx("h-2.5 rounded-full bg-white/[0.05]", running && "shimmer")} style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <footer className="mt-4 flex items-center gap-1 border-t border-line px-3 py-2.5">
        {m.status === "completed" && m.artifact ? (
          <>
            <button onClick={onOpen} className={buttonClass("ghost", "h-8 text-xs text-fg")}>
              <Icon name="doc" className="h-3.5 w-3.5" /> Open output
            </button>
            <CopyButton getText={async () => (await fetchArtifact(m.artifact!.id)).content} />
            <a href={`/api/artifacts/${m.artifact.id}?download=1`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:bg-white/[0.06] hover:text-fg">
              <Icon name="download" className="h-3.5 w-3.5" /> Download
            </a>
            <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-fg">
              <input type="checkbox" checked={selected} onChange={onToggle} className="accent-[var(--color-output)]" /> Compare
            </label>
          </>
        ) : (
          <span className="px-2 text-xs text-faint">{m.status === "queued" ? "Waiting for a worker…" : running ? "Executing…" : "No output was produced."}</span>
        )}
        {demo && m.status === "completed" && <Badge tone="demo" className="ml-2">simulated</Badge>}
      </footer>
    </article>
  );
}

function ModelTable({ models, now, onOpen, compare, onToggle }: { models: RM[]; now: number; onOpen: (artifactId: string) => void; compare: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="panel overflow-hidden">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-faint">
              <th className="w-10 py-3 pl-5" />
              <th className="px-3 py-3 font-medium">Model</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium text-price">Price</th>
              <th className="px-3 py-3 text-right font-medium text-time">Time</th>
              <th className="px-3 py-3 text-right font-medium text-output">Output</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {models.map((m) => (
              <tr key={m.id} className="hover:bg-white/[0.025]">
                <td className="py-3 pl-5">{m.status === "completed" && <input type="checkbox" checked={compare.includes(m.id)} onChange={() => onToggle(m.id)} className="accent-[var(--color-output)]" aria-label="Select for comparison" />}</td>
                <td className="max-w-[300px] px-3 py-3">
                  <ModelName name={m.modelName} variant={m.modelVariant} color={m.providerColor} />
                  {m.status === "failed" && <div className="ml-5 mt-1 truncate text-xs text-danger" title={m.errorMessage ?? ""}>{m.errorMessage}</div>}
                </td>
                <td className="px-3">
                  <StatusPill status={m.status} />
                </td>
                <td className="num px-3 text-right text-white" title={m.costNanoUsd != null ? formatUsdExact(m.costNanoUsd) : undefined}>
                  {m.status === "completed" ? formatUsd(m.costNanoUsd) : "—"}
                </td>
                <td className="num px-3 text-right text-white">{m.status === "completed" ? formatDuration(m.durationMs) : m.status === "running" && m.startedAt ? <span className="text-time">{formatDuration(now - m.startedAt)}</span> : "—"}</td>
                <td className="num px-3 text-right text-muted">{m.status === "completed" ? `${formatTokens(m.outputTokens)} tok` : "—"}</td>
                <td className="px-5 text-right">
                  {m.artifact && (
                    <button onClick={() => onOpen(m.artifact!.id)} className="text-xs text-fg hover:underline">
                      Open output
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
