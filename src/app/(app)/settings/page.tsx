import { requireCtx } from "@/server/auth/next";
import { getOrganization } from "@/server/orgs/service";
import { lastRefresh, liveProviderStatus, refreshHistory } from "@/server/catalogue/service";
import { usageSummary } from "@/server/runs/service";
import { livePriority, getProviders } from "@/server/providers/registry";
import { RefreshCatalogueButton, SimpleNameForm } from "@/components/team-forms";
import { Badge, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { formatDateTime, formatUsd, timeAgo } from "@/lib/format";

export const metadata = { title: "Settings" };

const ENV_VAR: Record<string, string> = { openrouter: "OPENROUTER_API_KEY", anthropic: "ANTHROPIC_API_KEY" };

export default async function SettingsPage() {
  const { session, ctx } = await requireCtx();
  const org = getOrganization(ctx);
  const providers = getProviders();
  const priority = livePriority();
  const status = liveProviderStatus();
  const refresh = lastRefresh();
  const history = refreshHistory(6);
  const usage = usageSummary(ctx);
  const live = usage.find((u) => u.mode === "live");
  const demo = usage.find((u) => u.mode === "demo");
  const isAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Workspace settings" />
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="space-y-10">
          <section>
            <SectionTitle>Profile</SectionTitle>
            <Panel className="p-5">
              <SimpleNameForm kind="profile" value={session.user.name} label="Your name" />
              <p className="mt-3 text-xs text-faint">Signed in as {session.user.email}</p>
            </Panel>
          </section>

          <section>
            <SectionTitle>Organization</SectionTitle>
            <Panel className="space-y-5 p-5">
              {isAdmin ? <SimpleNameForm kind="org" value={org.name} label="Organization name" /> : <div className="text-white">{org.name}</div>}
              <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                <span className="text-muted">Inference billing</span>
                <Badge>{org.billingMode === "passthrough" ? "Passed through at cost" : "Included in platform usage"}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-line pt-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Live inference spend</div>
                  <div className="num mt-1 text-2xl text-price">{formatUsd(live?.costNanoUsd ?? 0)}</div>
                  <div className="text-xs text-faint">{live?.executions ?? 0} measured executions</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Demo executions</div>
                  <div className="num mt-1 text-2xl text-demo">{demo?.executions ?? 0}</div>
                  <div className="text-xs text-faint">simulated, never billed</div>
                </div>
              </div>
            </Panel>
          </section>

          <section>
            <SectionTitle>Data & privacy</SectionTitle>
            <Panel className="space-y-3 p-5 text-sm text-muted">
              <p>Task definitions, files, outputs and run history belong to your organization and are only visible to its members.</p>
              <p>Uploaded files are encrypted at rest (AES-256-GCM) and served only through short-lived signed links that also check your membership.</p>
              <p>Task content is sent only to the inference provider executing a run you started, and is never written to logs or sent to analytics services.</p>
              <p>OpenRouter requests are restricted to endpoints that do not retain prompts for training (<code className="num text-xs">data_collection: deny</code>).</p>
              <p className="text-faint">Configurable retention periods are planned.</p>
            </Panel>
          </section>
        </div>

        <div className="space-y-10">
          <section id="providers">
            <SectionTitle>Inference providers</SectionTitle>
            <Panel className="divide-y divide-line overflow-hidden">
              {priority.map((id, i) => {
                const p = providers.get(id)!;
                return (
                  <div key={id} className="flex items-center gap-4 px-5 py-4">
                    <span className="num w-5 text-xs text-faint">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-white">{p.name}</div>
                      <div className="num text-xs text-faint">{ENV_VAR[id] ?? "configured in code"}</div>
                    </div>
                    {p.isConfigured() ? <Badge tone="ok">Connected</Badge> : <Badge>Not configured</Badge>}
                  </div>
                );
              })}
              <div className="flex items-center gap-4 px-5 py-4">
                <span className="num w-5 text-xs text-faint">·</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">Demo (simulated)</div>
                  <div className="text-xs text-faint">Always available · never billed · never a measurement</div>
                </div>
                <Badge tone="demo">Demo</Badge>
              </div>
            </Panel>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              {status.anyLive ? "Live runs are enabled. " : "No live provider is connected yet. "}
              Provider keys are server-side environment variables and are never exposed to the browser. Set <code className="num">OPENROUTER_API_KEY</code> (one key serves every priced model and reports billed cost per request) and/or <code className="num">ANTHROPIC_API_KEY</code>, then restart. Route order is controlled centrally by <code className="num">INFERENCE_PROVIDER_PRIORITY</code>.
            </p>
          </section>

          <section>
            <SectionTitle action={isAdmin ? <RefreshCatalogueButton /> : undefined}>Model catalogue</SectionTitle>
            <Panel className="p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Last refresh</span>
                <span className="text-fg">
                  {refresh ? `${timeAgo(refresh.completedAt ?? refresh.startedAt)} · ${refresh.status}` : "never"}
                </span>
              </div>
              {refresh?.sources.map((s) => (
                <div key={s.name} className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-faint">{s.name}</span>
                  {s.ok ? <Badge tone="ok">{s.records} records</Badge> : <Badge tone="danger" title={s.error}>failed</Badge>}
                </div>
              ))}
              <p className="mt-4 text-xs leading-relaxed text-faint">
                Refreshes automatically every {process.env.CATALOGUE_REFRESH_HOURS ?? 6}h. Price changes create new snapshots; historical runs keep the snapshot they were priced with. Models that disappear upstream are marked unavailable, never deleted. Set <code className="num">ARTIFICIAL_ANALYSIS_API_KEY</code> to pull reference scores directly from Artificial Analysis.
              </p>
            </Panel>
            {history.length > 0 && (
              <div className="panel-flat mt-3 divide-y divide-line">
                {history.map((h) => {
                  const sum = h.summary as { priceChanges?: unknown[]; newModels?: unknown[]; statusChanges?: unknown[]; discoveredUpstream?: unknown[] };
                  return (
                    <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                      <span className="text-muted">{formatDateTime(h.startedAt)}</span>
                      <span className="text-faint">
                        {h.status} · {sum.newModels?.length ?? 0} new · {sum.priceChanges?.length ?? 0} price changes · {sum.statusChanges?.length ?? 0} status changes · {sum.discoveredUpstream?.length ?? 0} other upstream models seen
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
