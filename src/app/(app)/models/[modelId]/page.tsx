import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getModelDetail } from "@/server/catalogue/service";
import { Badge, ButtonLink, EmptyState, ModeBadge, Panel, ProviderDot, SectionTitle } from "@/components/ui";
import { formatCompact, formatDate, formatDateTime, formatDuration, formatRate, formatUsd } from "@/lib/format";

export default async function ModelDetail({ params }: { params: Promise<{ modelId: string }> }) {
  const { ctx } = await requireCtx();
  const { modelId } = await params;
  const detail = getModelDetail(decodeURIComponent(modelId), ctx);
  if (!detail) notFound();
  const { model, pricingHistory, referenceHistory, ownResults, versions } = detail;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/models" className="text-sm text-muted hover:text-fg">
          ← Models
        </Link>
        <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2">
              <ProviderDot color={model.providerColor} /> {model.providerName}
            </div>
            <h1 className="display text-5xl text-white">
              {model.name} {model.variant && <span className="italic text-muted">({model.variant})</span>}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={model.status === "available" ? "ok" : "neutral"}>{model.status.replace("_", " ")}</Badge>
              <Badge tone={model.weights === "open" ? "output" : "neutral"}>{model.weights === "unknown" ? "weights: unknown" : `${model.weights} weights`}</Badge>
              {model.reasoningEffort && <Badge>reasoning effort: {model.reasoningEffort}</Badge>}
              <Badge>context {formatCompact(model.contextLength)}</Badge>
              <Badge>input: {model.inputModalities.join(", ")}</Badge>
            </div>
          </div>
          <ButtonLink href="/tasks" variant="secondary">
            Run a task on this model
          </ButtonLink>
        </div>
        {model.description && <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted">{model.description}</p>}
      </div>

      <section>
        <SectionTitle>Your results with this model</SectionTitle>
        {ownResults.length === 0 ? (
          <EmptyState title="No results yet" description="When your organization runs a task on this model, the actual price and time appear here." />
        ) : (
          <Panel className="overflow-hidden">
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                    <th className="px-5 py-3 font-medium">Task</th>
                    <th className="px-3 py-3 text-right font-medium text-price">Price</th>
                    <th className="px-3 py-3 text-right font-medium text-time">Time</th>
                    <th className="px-3 py-3 font-medium">Mode</th>
                    <th className="px-5 py-3 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ownResults.map((r) => (
                    <tr key={r.runModelId} className="hover:bg-white/[0.025]">
                      <td className="px-5 py-3">
                        <Link href={`/runs/${r.runId}`} className="text-fg hover:underline">
                          {r.taskName}
                        </Link>{" "}
                        <span className="text-xs text-faint">v{r.taskVersion}</span>
                      </td>
                      <td className="num px-3 text-right text-white">{formatUsd(r.costNanoUsd)}</td>
                      <td className="num px-3 text-right text-white">{formatDuration(r.durationMs)}</td>
                      <td className="px-3">
                        <ModeBadge mode={r.mode} />
                      </td>
                      <td className="px-5 text-right text-muted">{formatDateTime(r.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle>Pricing history · public list prices per 1M tokens</SectionTitle>
          <Panel className="overflow-hidden">
            {pricingHistory.length === 0 ? (
              <div className="p-5 text-sm text-muted">{model.statusReason ?? "No pricing published yet."}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                    <th className="px-5 py-3 font-medium">Captured</th>
                    <th className="px-3 py-3 text-right font-medium">Input</th>
                    <th className="px-3 py-3 text-right font-medium">Output</th>
                    <th className="px-5 py-3 text-right font-medium">Cache read</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pricingHistory.map((p, i) => (
                    <tr key={p.id}>
                      <td className="px-5 py-3 text-muted">
                        {formatDateTime(p.capturedAt)} {i === 0 && <Badge tone="ok" className="ml-1">current</Badge>}
                      </td>
                      <td className="num px-3 text-right">{formatRate(p.inputPerMTok)}</td>
                      <td className="num px-3 text-right">{formatRate(p.outputPerMTok)}</td>
                      <td className="num px-5 text-right text-muted">{formatRate(p.cacheReadPerMTok)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <p className="mt-2 text-xs text-faint">Snapshots are append-only. Each run keeps the snapshot it was priced with.</p>
        </section>

        <section>
          <SectionTitle>Public reference data</SectionTitle>
          <Panel className="divide-y divide-line overflow-hidden">
            {referenceHistory.length === 0 && <div className="p-5 text-sm text-muted">No reference data.</div>}
            {referenceHistory.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="text-fg">{r.metric === "aa_intelligence_index" ? "Intelligence Index" : r.metric === "aa_cost_per_index_task_usd" ? "AA cost per Index task" : r.metric}</div>
                  <div className="truncate text-xs text-faint">
                    {r.source}
                    {r.sourceVersion ? ` · ${r.sourceVersion}` : ""} · {formatDate(r.capturedAt)}
                  </div>
                </div>
                <div className="num text-muted">{r.metric.endsWith("_usd") ? `$${r.value.toFixed(2)}` : r.value}</div>
              </div>
            ))}
          </Panel>
          <p className="mt-2 text-xs text-faint">Reference data describes the model in general. It says nothing about how your task performs.</p>
        </section>
      </div>

      <section>
        <SectionTitle>Model versions</SectionTitle>
        <div className="panel-flat divide-y divide-line">
          {versions.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <span className="num text-xs text-muted">{v.upstreamId ?? "no upstream id"}</span>
              <span className="text-xs text-faint">
                {Object.entries(v.config)
                  .filter(([, x]) => x != null)
                  .map(([k, x]) => `${k}: ${String(x)}`)
                  .join(" · ")}{" "}
                · first seen {formatDate(v.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
