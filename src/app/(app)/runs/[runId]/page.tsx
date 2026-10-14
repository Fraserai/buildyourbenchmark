import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getRun, getRunInput } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";
import { cancelRunAction } from "@/app/actions";
import { RunLive } from "@/components/run-live";
import { RunNotes } from "@/components/run-notes";
import { CostBar } from "@/components/cost-bar";
import { Badge, Button, ButtonLink, Icon, ModeBadge, ModelName, Panel, SectionTitle } from "@/components/ui";
import { formatDateTime, formatDuration, formatRate, formatTokens, formatUsdExact } from "@/lib/format";

export const metadata = { title: "Run" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { ctx } = await requireCtx();
  const { runId } = await params;
  let view;
  try {
    view = getRun(ctx, runId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const input = await getRunInput(ctx, runId);
  const activeRun = view.run.status === "queued" || view.run.status === "running";
  const outdated = view.version.id !== view.task.currentVersionId;

  return (
    <div>
      <Link href={`/tasks/${view.task.id}`} className="text-sm text-muted hover:text-fg">
        ← {view.task.name}
      </Link>

      <div className="mb-8 mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-3 flex flex-wrap items-center gap-2">
            Run · {formatDateTime(view.run.createdAt)} · {view.createdByName}
          </div>
          <h1 className="display text-4xl leading-[1.05] text-white md:text-5xl">{view.run.label ?? view.task.name}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ModeBadge mode={view.run.mode} />
            <Badge tone="output">
              Task v{view.version.version}
              {outdated ? " (older version)" : ""}
            </Badge>
            <Badge title={view.run.payloadHash}>
              Same input to all models · <span className="num">#{view.run.payloadHash.slice(0, 10)}</span>
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeRun && (
            <form action={cancelRunAction}>
              <input type="hidden" name="runId" value={runId} />
              <Button variant="danger" className="h-10">
                Cancel run
              </Button>
            </form>
          )}
          <ButtonLink href={`/tasks/${view.task.id}/run?from=${runId}`} variant="secondary" className="h-10">
            <Icon name="refresh" /> Run again
          </ButtonLink>
        </div>
      </div>

      {view.run.mode === "demo" && (
        <div className="mb-6 rounded-2xl border border-demo/30 bg-demo/[0.07] px-5 py-4 text-sm">
          <span className="font-medium text-demo">Demo run: simulated.</span> <span className="text-muted">No model was called. Prices, times and outputs on this page are placeholders for trying the workflow and are not measurements.</span>
        </div>
      )}

      <details className="panel-flat group mb-8">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
          <Icon name="doc" className="text-muted" />
          <span className="text-sm text-fg">Input: exactly what every model received</span>
          <span className={`ml-2 text-xs ${input.matches ? "text-price" : "text-danger"}`}>{input.matches ? "✓ hash verified" : "hash mismatch"}</span>
          <Icon name="chevron" className="ml-auto text-faint transition-transform group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t border-line px-5 py-5">
          {input.system && (
            <div>
              <div className="label">System · task instructions</div>
              <pre className="scroll-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-black/30 p-4 text-[13px] leading-relaxed text-fg/90">{input.system}</pre>
            </div>
          )}
          <div>
            <div className="label">User · {input.system ? "inputs and files" : "task instructions"}</div>
            <pre className="scroll-thin max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-black/30 p-4 text-[13px] leading-relaxed text-fg/90">{input.user}</pre>
          </div>
          <div className="num text-[11px] text-faint">
            payload sha256 {input.hash} · max output tokens {input.maxOutputTokens.toLocaleString()}
          </div>
        </div>
      </details>

      <RunLive initial={view} />

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle>Measurement details</SectionTitle>
          <div className="space-y-2">
            {view.models.map((m) => (
              <details key={m.id} className="panel-flat group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <ModelName name={m.modelName} variant={m.modelVariant} color={m.providerColor} className="text-sm" />
                  <Icon name="chevron" className="ml-auto text-faint transition-transform group-open:rotate-90" />
                </summary>
                <div className="grid gap-x-8 gap-y-2 border-t border-line px-4 py-4 text-xs sm:grid-cols-2">
                  <Row k="Status" v={m.status} />
                  <Row k="Attempts" v={String(m.attempts)} />
                  <Row k="Input tokens (uncached)" v={formatTokens(m.inputTokens)} />
                  <Row k="Cache read / write tokens" v={`${formatTokens(m.cacheReadTokens)} / ${formatTokens(m.cacheWriteTokens)}`} />
                  <Row k="Output tokens" v={formatTokens(m.outputTokens)} />
                  <Row k="…of which reasoning" v={formatTokens(m.reasoningTokens)} />
                  <Row k="Cost shown" v={`${formatUsdExact(m.costNanoUsd)}${m.costSource ? ` (${m.costSource.replace("_", " ")})` : ""}`} />
                  <Row k="Provider-billed" v={formatUsdExact(m.providerCostNanoUsd)} />
                  <Row k="Calculated from usage" v={formatUsdExact(m.calculatedCostNanoUsd)} />
                  <Row k="Pricing snapshot" v={m.pricingSnapshot ? `${formatRate(m.pricingSnapshot.inputPerMTok)} in / ${formatRate(m.pricingSnapshot.outputPerMTok)} out per 1M · ${formatDateTime(m.pricingSnapshot.capturedAt)}` : "—"} />
                  <Row k="Execution time" v={formatDuration(m.durationMs)} />
                  <Row k="Time to first token" v={formatDuration(m.timeToFirstTokenMs)} />
                  <Row k="Started / completed" v={`${formatDateTime(m.startedAt)} → ${formatDateTime(m.completedAt)}`} />
                  <Row k="Route" v={`${m.inferenceProvider} · ${m.providerModelId}`} />
                  <Row k="Configuration" v={Object.entries(m.requestParams).map(([k, v]) => `${k}=${String(v)}`).join(" · ") || "—"} />
                  <Row k="Served by" v={m.servedBy ?? "—"} />
                  <Row k="Finish reason" v={m.finishReason ?? "—"} />
                  <Row k="Request ID" v={m.providerRequestId ?? "—"} />
                  <Row k="Payload hash" v={m.payloadHash ? `${m.payloadHash.slice(0, 16)}… ${m.payloadHash === view.run.payloadHash ? "✓ matches run" : "✗ mismatch"}` : "—"} />
                  {m.artifact && <Row k="Output sha256" v={`${m.artifact.sha256.slice(0, 16)}… · ${m.artifact.sizeBytes.toLocaleString()} bytes`} />}
                  {m.costBreakdown && (
                    <div className="sm:col-span-2">
                      <div className="mb-2 mt-2 text-faint">Cost composition</div>
                      <CostBar breakdown={m.costBreakdown} showLegend />
                      {m.costBreakdown.rateNotes.map((n) => (
                        <p key={n} className="mt-1 text-demo">
                          {n}
                        </p>
                      ))}
                    </div>
                  )}
                  {typeof m.providerMeta?.costNote === "string" && <p className="text-demo sm:col-span-2">{m.providerMeta.costNote}</p>}
                </div>
              </details>
            ))}
          </div>
        </section>
        <aside>
          <SectionTitle>Saved record</SectionTitle>
          <Panel className="p-5">
            <p className="mb-4 text-sm text-muted">This run is saved permanently with its task version, pricing snapshots and outputs. Add a label or notes for your team.</p>
            <RunNotes runId={runId} label={view.run.label} notes={view.run.notes} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/[0.04] py-1.5">
      <span className="shrink-0 text-faint">{k}</span>
      <span className="num break-all text-right text-muted">{v}</span>
    </div>
  );
}
