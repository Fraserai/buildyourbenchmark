import Link from "next/link";
import { requireCtx } from "@/server/auth/next";
import { listTasks } from "@/server/tasks/service";
import { listRuns } from "@/server/runs/service";
import { listCatalogue, liveProviderStatus } from "@/server/catalogue/service";
import { getOrganization, workspaceStats } from "@/server/orgs/service";
import { Badge, ButtonLink, EmptyState, Icon, ModeBadge, ModelName, Panel, ProviderDot, SectionTitle, StatusPill } from "@/components/ui";
import { formatDuration, formatRate, formatUsd, timeAgo } from "@/lib/format";

export const metadata = { title: "Workspace" };

export default async function Workspace({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { session, ctx } = await requireCtx();
  const sp = await searchParams;
  const org = getOrganization(ctx);
  const stats = workspaceStats(ctx);
  const tasks = listTasks(ctx).slice(0, 6);
  const runs = listRuns(ctx, { limit: 6 });
  const catalogue = listCatalogue(ctx);
  const available = catalogue.filter((m) => m.status === "available");
  const providers = liveProviderStatus();
  const firstName = session.user.name.split(" ")[0];
  const isNew = stats.tasks === 0;

  return (
    <div className="space-y-12">
      <section className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow mb-3">{org.name}</div>
          <h1 className="display text-5xl leading-[1.02] text-white md:text-6xl">
            {sp.welcome ? `Welcome, ${firstName}.` : "Your work."}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-muted">
            {isNew ? "Create a task from something your business actually does, choose models, and see the actual price, time and output." : "Your tasks, your runs, and the current models."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/tasks/new" className="h-11 px-5">
            <Icon name="plus" /> Create task
          </ButtonLink>
          <ButtonLink href="/models" variant="secondary" className="h-11 px-5">
            View models
          </ButtonLink>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
        {[
          { label: "Tasks", value: stats.tasks, href: "/tasks" },
          { label: "Departments", value: stats.departments, href: "/team" },
          { label: "Runs", value: stats.runs, href: "/runs" },
          { label: "Model executions", value: stats.executions, href: "/runs" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="group bg-ink-950/85 p-5 transition-colors hover:bg-ink-900/90 md:p-6">
            <div className="num text-4xl text-white">{s.value.toLocaleString()}</div>
            <div className="mt-2 flex items-center gap-1 text-sm text-muted group-hover:text-fg">
              {s.label} <Icon name="chevron" className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </Link>
        ))}
      </section>

      {isNew && (
        <section className="grid gap-4 md:grid-cols-3">
          {[
            { n: "1", t: "Create a task", d: "Name it, paste the instructions your team follows, attach the real inputs.", href: "/tasks/new", cta: "Create task" },
            { n: "2", t: "Choose models", d: `${available.length} models are ready in the catalogue, closed and open-weight.`, href: "/models", cta: "Browse models" },
            { n: "3", t: "Run & measure", d: "See the actual price, time and output of every model, side by side.", href: "/tasks/new", cta: "Start" },
          ].map((s) => (
            <Panel key={s.n} className="p-6">
              <div className="num text-sm text-faint">0{s.n}</div>
              <div className="mt-5 text-lg font-medium text-white">{s.t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.d}</p>
              <Link href={s.href} className="mt-5 inline-flex items-center gap-1.5 text-sm text-fg hover:underline">
                {s.cta} <Icon name="arrow" className="h-3.5 w-3.5" />
              </Link>
            </Panel>
          ))}
        </section>
      )}

      {!providers.anyLive && (
        <div className="panel-flat flex flex-col gap-3 border-demo/25 bg-demo/[0.06] p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-medium text-demo">No inference provider connected.</span>{" "}
            <span className="text-muted">Runs can be tried in demo mode (simulated, clearly labelled). Add an OpenRouter or Anthropic key to measure real results.</span>
          </div>
          <Link href="/settings#providers" className="shrink-0 text-demo hover:underline">
            How to connect →
          </Link>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <SectionTitle action={<Link href="/tasks" className="text-xs text-muted hover:text-fg">All tasks →</Link>}>Recent tasks</SectionTitle>
          {tasks.length === 0 ? (
            <EmptyState title="No tasks yet" description="A task is one piece of work your business actually does: a client enquiry, an invoice, a complaint." action={<ButtonLink href="/tasks/new"><Icon name="plus" /> Create your first task</ButtonLink>} />
          ) : (
            <div className="panel divide-y divide-line overflow-hidden">
              {tasks.map((t) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.03] text-muted">
                    <Icon name="doc" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-white">{t.name}</div>
                    <div className="mt-0.5 truncate text-xs text-faint">
                      {[t.departmentName, t.workflowName].filter(Boolean).join(" · ") || "No department"} · v{t.version}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-faint sm:block">
                    <div>{t.runs} run{t.runs === 1 ? "" : "s"}</div>
                    <div>{t.lastRunAt ? timeAgo(t.lastRunAt) : "not run yet"}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle action={<Link href="/runs" className="text-xs text-muted hover:text-fg">Run history →</Link>}>Recent runs</SectionTitle>
          {runs.length === 0 ? (
            <EmptyState title="No runs yet" description="Runs appear here with their actual cost and time." />
          ) : (
            <div className="panel divide-y divide-line overflow-hidden">
              {runs.map((r) => (
                <Link key={r.id} href={`/runs/${r.id}`} className="block px-5 py-4 transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-sm font-medium text-white">{r.taskName}</div>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-faint">
                    <span className="flex -space-x-1">
                      {r.models.slice(0, 6).map((m, i) => (
                        <ProviderDot key={i} color={m.providerColor} />
                      ))}
                    </span>
                    <span>{r.models.length} model{r.models.length === 1 ? "" : "s"}</span>
                    <span className="num text-price">{formatUsd(r.totalCostNanoUsd)}</span>
                    {r.mode === "demo" && <ModeBadge mode="demo" />}
                    <span className="ml-auto">{timeAgo(r.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionTitle action={<Link href="/models" className="text-xs text-muted hover:text-fg">Full catalogue →</Link>}>Current models</SectionTitle>
        <div className="scroll-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {available.slice(0, 10).map((m) => (
            <Link key={m.id} href={`/models/${encodeURIComponent(m.id)}`} className="panel-flat w-60 shrink-0 p-4 transition-colors hover:bg-white/[0.05]">
              <ModelName name={m.name} variant={m.variant} color={m.providerColor} className="text-sm" />
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-faint">{m.providerName}</span>
                <span className="num text-muted">
                  {formatRate(m.pricing?.inputPerMTok)} / {formatRate(m.pricing?.outputPerMTok)}
                </span>
              </div>
              {m.ownCompletedRuns > 0 && (
                <div className="mt-2">
                  <Badge tone="output">{m.ownCompletedRuns} of your executions</Badge>
                </div>
              )}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">Public list prices per 1M input / output tokens. Your actual costs appear on each run.</p>
      </section>
    </div>
  );
}
