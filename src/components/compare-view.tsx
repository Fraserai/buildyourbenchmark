"use client";

import { useRef, useState } from "react";
import { CopyButton, OutputBody, RawToggle, type ArtifactType } from "./output-view";
import { Icon, ModelName, ProviderDot, cx } from "./ui";
import { formatDuration, formatTokens, formatUsd } from "@/lib/format";

export type CompareColumn = {
  id: string;
  artifactId: string;
  modelName: string;
  modelVariant: string | null;
  providerColor: string;
  costNanoUsd: number | null;
  durationMs: number | null;
  outputTokens: number | null;
  content: string;
  artifactType: ArtifactType;
};

export function CompareView({ columns, all, demo }: { columns: string[]; all: CompareColumn[]; demo: boolean }) {
  const [shown, setShown] = useState<string[]>(columns.length ? columns : all.slice(0, 3).map((c) => c.id));
  const [raw, setRaw] = useState(false);
  const [sync, setSync] = useState(true);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const syncing = useRef(false);

  const onScroll = (id: string) => {
    if (!sync || syncing.current) return;
    const src = refs.current[id];
    if (!src) return;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    syncing.current = true;
    for (const [k, el] of Object.entries(refs.current)) {
      if (k !== id && el) el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
    }
    requestAnimationFrame(() => (syncing.current = false));
  };

  const cols = shown.map((id) => all.find((c) => c.id === id)).filter((c): c is CompareColumn => Boolean(c));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {all.map((c) => {
            const on = shown.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setShown((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                className={cx("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs", on ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}
              >
                <ProviderDot color={c.providerColor} className="h-2 w-2 ring-0" />
                {c.modelName}
                {c.modelVariant && <span className="text-faint">{c.modelVariant}</span>}
                {on && <Icon name="x" className="h-3 w-3 text-faint" />}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-[var(--color-output)]" /> Sync scroll
        </label>
        <RawToggle raw={raw} setRaw={setRaw} />
      </div>

      {cols.length === 0 ? (
        <div className="panel-flat px-6 py-14 text-center text-sm text-muted">Select outputs above to compare them side by side.</div>
      ) : (
        <div className="scroll-thin -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {cols.map((c) => (
            <section
              key={c.id}
              className="panel flex h-[calc(100dvh-260px)] min-h-[480px] shrink-0 snap-start flex-col overflow-hidden"
              style={{
                width:
                  cols.length === 1
                    ? "100%"
                    : cols.length === 2
                      ? "max(min(88vw, 340px), calc(50% - 8px))"
                      : cols.length === 3
                        ? "max(min(88vw, 340px), calc(33.333% - 11px))"
                        : "min(88vw, 400px)",
              }}
            >
              <header className="border-b border-line px-5 py-4">
                <ModelName name={c.modelName} variant={c.modelVariant} color={c.providerColor} className="text-[15px]" />
                <div className="mt-3 flex items-center gap-5 text-sm">
                  <span className="num text-price" title="Price">{formatUsd(c.costNanoUsd)}</span>
                  <span className="num text-time" title="Time">{formatDuration(c.durationMs)}</span>
                  <span className="num text-output" title="Output tokens">{formatTokens(c.outputTokens)} tok</span>
                  <CopyButton text={c.content} className="ml-auto" />
                </div>
              </header>
              <div ref={(el) => void (refs.current[c.id] = el)} onScroll={() => onScroll(c.id)} className="scroll-thin flex-1 overflow-y-auto px-5 py-5">
                <OutputBody content={c.content} type={c.artifactType} raw={raw} />
              </div>
            </section>
          ))}
        </div>
      )}
      {demo && <p className="mt-2 text-xs text-demo">Demo run: outputs are simulated placeholders.</p>}
    </div>
  );
}
