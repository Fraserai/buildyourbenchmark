import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getTask, getTaskVersion } from "@/server/tasks/service";
import { getRun, listRuns } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";
import { signPath } from "@/server/security/crypto";
import { setTaskStatusAction } from "@/app/actions";
import { Badge, Button, ButtonLink, EmptyState, Icon, ModeBadge, ModelName, Panel, ProviderDot, SectionTitle, StatusPill } from "@/components/ui";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatUsd, timeAgo } from "@/lib/format";

export const metadata = { title: "Task" };

export default async function TaskDetail({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ v?: string }> }) {
  const { ctx } = await requireCtx();
  const { taskId } = await params;
  const sp = await searchParams;
  let t;
  try {
    t = getTask(ctx, taskId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const selected = t.versions.find((v) => String(v.version) === sp.v) ?? t.versions[0];
  const { version, files } = getTaskVersion(ctx, selected.id);
  const isCurrent = version.id === t.task.currentVersionId;
  const runs = listRuns(ctx, { taskId });
  const latest = runs.find((r) => r.completedCount > 0);
  const latestView = latest ? getRun(ctx, latest.id) : null;

  return (
    <div>
      <Link href="/tasks" className="text-sm text-muted hover:text-fg">
        ← Tasks
      </Link>

      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-3">{[t.department?.name, t.workflow?.name].filter(Boolean).join(" › ") || "Task"}</div>
          <h1 className="display text-4xl leading-[1.05] text-white md:text-5xl">{t.task.name}</h1>
          {t.task.description && <p className="mt-3 max-w-2xl text-[15px] text-muted">{t.task.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-faint">
            <Badge tone="output">v{t.versions[0].version}</Badge>
            {t.task.status === "archived" && <Badge tone="danger">Archived</Badge>}
            {t.task.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
            <span>Created by {t.createdByName} · {formatDate(t.task.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/tasks/${taskId}/run`} className="h-11 px-5">
            <Icon name="play" className="h-3.5 w-3.5" /> Run this task
          </ButtonLink>
          <ButtonLink href={`/tasks/${taskId}/edit`} variant="secondary" className="h-11">
            Edit
          </ButtonLink>
          <form action={setTaskStatusAction}>
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="status" value={t.task.status === "archived" ? "active" : "archived"} />
            <Button variant="ghost" className="h-11">
              {t.task.status === "archived" ? "Restore" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

      {latestView && (
        <section className="mt-10">
          <SectionTitle action={<Link href={`/runs/${latestView.run.id}`} className="text-xs text-muted hover:text-fg">Open run →</Link>}>
            Latest results · {timeAgo(latestView.run.createdAt)} · v{latestView.version.version}
          </SectionTitle>
          <div className="panel scroll-thin overflow-x-auto">
            <div className="flex min-w-max divide-x divide-line">
              {latestView.models.map((m) => (
                <Link key={m.id} href={`/runs/${latestView.run.id}`} className="w-56 shrink-0 p-4 transition-colors hover:bg-white/[0.03]">
                  <ModelName name={m.modelName} variant={m.modelVariant} color={m.providerColor} className="text-sm" />
                  {m.status === "completed" ? (
                    <div className="mt-3 flex items-baseline gap-4">
                      <span className="num text-lg text-price">{formatUsd(m.costNanoUsd)}</span>
                      <span className="num text-lg text-time">{formatDuration(m.durationMs)}</span>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <StatusPill status={m.status} />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
          {latestView.run.mode === "demo" && <p className="mt-2 text-xs text-demo">Demo run: simulated values, not measurements.</p>}
        </section>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">
              Definition · v{version.version} {isCurrent ? <span className="text-price">(current)</span> : <span className="text-demo">(older version)</span>}
            </h2>
            <span className="num text-[11px] text-faint" title="Content hash of this version">
              #{version.contentHash.slice(0, 12)}
            </span>
          </div>

          <Panel className="p-6">
            <div className="label">Instructions</div>
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-fg">{version.instructions}</div>
          </Panel>

          <Panel className="p-6">
            <div className="label">Input</div>
            {version.inputText.trim() ? (
              <div className="scroll-thin max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{version.inputText}</div>
            ) : (
              <div className="text-sm text-faint">No inline input{files.length ? "; see files below" : ""}.</div>
            )}
          </Panel>

          <Panel className="p-6">
            <div className="label">Files</div>
            {files.length === 0 ? (
              <div className="text-sm text-faint">No files attached.</div>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="panel-flat">
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                        <Icon name="file" className={f.role === "input" ? "text-output" : "text-time"} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-fg">{f.filename}</div>
                          <div className="text-[11px] text-faint">
                            {f.role} · {formatBytes(f.sizeBytes)} · {f.extractionMethod}
                          </div>
                        </div>
                        <a href={signPath(`/api/files/${f.id}`)} className="rounded-lg p-1.5 text-faint hover:bg-white/[0.06] hover:text-fg" aria-label={`Download ${f.filename}`}>
                          <Icon name="download" />
                        </a>
                        <Icon name="chevron" className="text-faint transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="border-t border-line px-4 py-3">
                        {f.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={signPath(`/api/files/${f.id}`) + "&inline=1"} alt={f.filename} className="max-h-80 rounded-lg" />
                        ) : (
                          <>
                            <div className="mb-2 text-[11px] text-faint">Exactly what every model reads:</div>
                            <pre className="scroll-thin max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-muted">{f.extractedText}</pre>
                          </>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-xs text-faint">Max output tokens: {version.maxOutputTokens.toLocaleString()} · applied identically to every model.</p>
        </div>

        <aside className="space-y-8">
          <section>
            <SectionTitle>Runs</SectionTitle>
            {runs.length === 0 ? (
              <EmptyState
                title="Not run yet"
                description="Choose models and run this task to measure price, time and output."
                action={
                  <ButtonLink href={`/tasks/${taskId}/run`}>
                    <Icon name="play" className="h-3.5 w-3.5" /> Run
                  </ButtonLink>
                }
              />
            ) : (
              <div className="panel divide-y divide-line overflow-hidden">
                {runs.map((r) => (
                  <Link key={r.id} href={`/runs/${r.id}`} className="block px-4 py-3.5 transition-colors hover:bg-white/[0.03]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-fg">{formatDateTime(r.createdAt)}</span>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-2.5 text-xs text-faint">
                      <span className="flex -space-x-1">
                        {r.models.slice(0, 5).map((m, i) => (
                          <ProviderDot key={i} color={m.providerColor} />
                        ))}
                      </span>
                      <span>{r.models.length} models</span>
                      <span className="num text-price">{formatUsd(r.totalCostNanoUsd)}</span>
                      <span>v{r.taskVersion}</span>
                      {r.mode === "demo" && <ModeBadge mode="demo" />}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle>Versions</SectionTitle>
            <div className="panel-flat divide-y divide-line">
              {t.versions.map((v) => (
                <Link key={v.id} href={`/tasks/${taskId}?v=${v.version}`} className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/[0.03] ${v.id === version.id ? "bg-white/[0.04]" : ""}`}>
                  <span className="num w-8 shrink-0 text-output">v{v.version}</span>
                  <div className="min-w-0">
                    <div className="truncate text-fg">{v.changeNote ?? (v.version === 1 ? "Created" : "Updated")}</div>
                    <div className="text-xs text-faint">
                      {v.createdByName} · {formatDateTime(v.createdAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
