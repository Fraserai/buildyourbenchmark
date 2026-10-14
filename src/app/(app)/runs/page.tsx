import Link from "next/link";
import { requireCtx } from "@/server/auth/next";
import { listRuns } from "@/server/runs/service";
import { EmptyState, ModeBadge, PageHeader, ProviderDot, StatusPill, ButtonLink, Icon, cx } from "@/components/ui";
import { formatDateTime, formatDuration, formatUsd } from "@/lib/format";

export const metadata = { title: "Run history" };

export default async function RunsPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { ctx } = await requireCtx();
  const sp = await searchParams;
  const mode = sp.mode === "live" || sp.mode === "demo" ? sp.mode : undefined;
  const runs = listRuns(ctx, { mode, limit: 500 });

  return (
    <div>
      <PageHeader eyebrow="Run history" title="Every measurement, kept" description="Each run is a permanent record of what happened: task version, models, actual price, actual time and exact outputs." />
      <div className="mb-5 flex gap-1.5">
        {[
          { v: undefined, l: "All" },
          { v: "live", l: "Live" },
          { v: "demo", l: "Demo" },
        ].map((o) => (
          <Link key={o.l} href={o.v ? `/runs?mode=${o.v}` : "/runs"} className={cx("rounded-full border px-3 py-1.5 text-sm", mode === o.v ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}>
            {o.l}
          </Link>
        ))}
      </div>
      {runs.length === 0 ? (
        <EmptyState title="No runs yet" description="Run a task to create your first measurement." action={<ButtonLink href="/tasks"><Icon name="play" className="h-3.5 w-3.5" /> Go to tasks</ButtonLink>} />
      ) : (
        <div className="panel overflow-hidden">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.1em] text-faint">
                  <th className="px-5 py-3 font-medium">Task</th>
                  <th className="px-3 py-3 font-medium">Models</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium text-price">Total price</th>
                  <th className="px-3 py-3 text-right font-medium text-time">Wall time</th>
                  <th className="px-5 py-3 text-right font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => (
                  <tr key={r.id} className="group hover:bg-white/[0.025]">
                    <td className="max-w-[340px] px-5 py-3.5">
                      <Link href={`/runs/${r.id}`} className="block">
                        <div className="truncate font-medium text-white group-hover:underline">{r.label ?? r.taskName}</div>
                        <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-faint">
                          {r.label ? `${r.taskName} · ` : ""}v{r.taskVersion}
                          {r.departmentName ? ` · ${r.departmentName}` : ""} · {r.createdByName}
                          {r.mode === "demo" && <ModeBadge mode="demo" />}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3">
                      <div className="flex items-center gap-2">
                        <span className="flex -space-x-1">
                          {r.models.slice(0, 8).map((m, i) => (
                            <ProviderDot key={i} color={m.providerColor} />
                          ))}
                        </span>
                        <span className="text-xs text-muted">
                          {r.completedCount}/{r.models.length}
                        </span>
                      </div>
                    </td>
                    <td className="px-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="num px-3 text-right text-white">{formatUsd(r.totalCostNanoUsd)}</td>
                    <td className="num px-3 text-right text-white">{formatDuration(r.durationMs)}</td>
                    <td className="px-5 text-right text-xs text-muted">{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
