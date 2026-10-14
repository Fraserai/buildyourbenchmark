"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogueModel } from "@/server/catalogue/service";
import { Badge, Icon, ModelName, cx } from "./ui";
import { formatCompact, formatRate } from "@/lib/format";

type SortKey = "reference" | "input" | "output" | "name" | "context";

export function CatalogueTable({ models }: { models: CatalogueModel[] }) {
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("all");
  const [weights, setWeights] = useState<"all" | "open" | "closed">("all");
  const [runnableOnly, setRunnableOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "reference", dir: -1 });

  const providers = useMemo(() => [...new Map(models.map((m) => [m.providerId, m.providerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [models]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const val = (m: CatalogueModel): number | string | null => {
      switch (sort.key) {
        case "reference":
          return m.reference.intelligenceIndex?.value ?? null;
        case "input":
          return m.pricing ? Number(m.pricing.inputPerMTok) : null;
        case "output":
          return m.pricing ? Number(m.pricing.outputPerMTok) : null;
        case "context":
          return m.contextLength;
        case "name":
          return m.name.toLowerCase();
      }
    };
    return models
      .filter((m) => (needle ? `${m.name} ${m.variant ?? ""} ${m.providerName}`.toLowerCase().includes(needle) : true))
      .filter((m) => provider === "all" || m.providerId === provider)
      .filter((m) => weights === "all" || m.weights === weights)
      .filter((m) => !runnableOnly || m.status === "available")
      .sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (va === null && vb === null) return a.sortOrder - b.sortOrder;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir || a.sortOrder - b.sortOrder;
      });
  }, [models, q, provider, weights, runnableOnly, sort]);

  const th = (key: SortKey, label: string, className?: string) => (
    <th className={cx("px-3 py-3 font-medium", className)}>
      <button
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
        className={cx("inline-flex items-center gap-1 hover:text-fg", sort.key === key && "text-fg")}
      >
        {label}
        {sort.key === key && <span className="text-[10px]">{sort.dir === 1 ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models or providers" className="field pl-9" aria-label="Search models" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="field w-auto py-2" aria-label="Provider">
            <option value="all">All providers</option>
            {providers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl border border-line bg-black/20 p-1 text-sm">
            {(["all", "open", "closed"] as const).map((w) => (
              <button key={w} onClick={() => setWeights(w)} className={cx("rounded-lg px-3 py-1.5 capitalize", weights === w ? "bg-white/10 text-white" : "text-muted hover:text-fg")}>
                {w === "all" ? "All weights" : w}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-line bg-black/20 px-3 text-sm text-muted">
            <input type="checkbox" checked={runnableOnly} onChange={(e) => setRunnableOnly(e.target.checked)} className="accent-[var(--color-price)]" />
            Available only
          </label>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                {th("name", "Model", "pl-5")}
                <th className="px-3 py-3 font-medium">Weights</th>
                {th("context", "Context", "text-right")}
                {th("input", "Input /1M", "text-right")}
                {th("output", "Output /1M", "text-right")}
                <th className="border-l border-line bg-white/[0.015] px-3 py-3 font-medium" colSpan={1}>
                  <button onClick={() => setSort((s) => ({ key: "reference", dir: s.key === "reference" ? (s.dir === 1 ? -1 : 1) : -1 }))} className={cx("inline-flex items-center gap-1 hover:text-fg", sort.key === "reference" && "text-fg")}>
                    Intelligence index <span className="normal-case tracking-normal text-faint">(public ref.)</span>
                    {sort.key === "reference" && <span className="text-[10px]">{sort.dir === 1 ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 pr-5 text-right font-medium">Your runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m.id} className="group transition-colors hover:bg-white/[0.025]">
                  <td className="max-w-[320px] py-3.5 pl-5 pr-3">
                    <Link href={`/models/${encodeURIComponent(m.id)}`} className="block">
                      <ModelName name={m.name} variant={m.variant} color={m.providerColor} />
                      <div className="ml-5 mt-0.5 text-xs text-faint">{m.providerName}</div>
                    </Link>
                  </td>
                  <td className="px-3">
                    <Badge tone={m.weights === "open" ? "output" : "neutral"}>{m.weights === "unknown" ? "—" : m.weights}</Badge>
                  </td>
                  <td className="num px-3 text-right text-muted">{formatCompact(m.contextLength)}</td>
                  <td className="num px-3 text-right text-fg">{formatRate(m.pricing?.inputPerMTok)}</td>
                  <td className="num px-3 text-right text-fg">{formatRate(m.pricing?.outputPerMTok)}</td>
                  <td className="border-l border-line bg-white/[0.015] px-3" title={m.reference.intelligenceIndex ? `${m.reference.intelligenceIndex.source}${m.reference.intelligenceIndex.version ? ` ${m.reference.intelligenceIndex.version}` : ""}` : undefined}>
                    {m.reference.intelligenceIndex ? (
                      <div className="flex items-center gap-2.5">
                        <span className="num w-9 text-right text-muted">{m.reference.intelligenceIndex.value.toFixed(m.reference.intelligenceIndex.value % 1 ? 1 : 0)}</span>
                        <span className="h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full bg-white/30" style={{ width: `${Math.min(100, (m.reference.intelligenceIndex.value / 70) * 100)}%` }} />
                        </span>
                      </div>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3">
                    {m.status === "available" ? (
                      <Badge tone="ok">Available</Badge>
                    ) : m.status === "pricing_unavailable" ? (
                      <Badge title={m.statusReason ?? undefined}>No pricing</Badge>
                    ) : (
                      <Badge tone="danger" title={m.statusReason ?? undefined}>
                        {m.status === "unavailable" ? "Unavailable" : "Deprecated"}
                      </Badge>
                    )}
                  </td>
                  <td className="num px-3 pr-5 text-right">{m.ownCompletedRuns > 0 ? <span className="text-output">{m.ownCompletedRuns}</span> : <span className="text-faint">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted">No models match those filters.</div>}
      </div>
    </div>
  );
}
