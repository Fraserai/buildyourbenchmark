import Link from "next/link";
import { requireCtx } from "@/server/auth/next";
import { listTasks } from "@/server/tasks/service";
import { listDepartments } from "@/server/orgs/service";
import { Badge, ButtonLink, EmptyState, Icon, PageHeader, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; archived?: string }> }) {
  const { ctx } = await requireCtx();
  const sp = await searchParams;
  const departments = listDepartments(ctx);
  const tasks = listTasks(ctx, { q: sp.q, departmentId: sp.dept, status: sp.archived ? "archived" : "active" });
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, dept: sp.dept, archived: sp.archived, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/tasks?${s}` : "/tasks";
  };

  // Group by department → workflow so large libraries stay navigable.
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const key = t.departmentName ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Task library"
        title="Your work"
        description="Every task is a real piece of work your business does. Versioned, private to your organization, and runnable against any model."
        actions={
          <ButtonLink href="/tasks/new">
            <Icon name="plus" /> Create task
          </ButtonLink>
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <form className="relative flex-1" action="/tasks">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={sp.q} placeholder="Search tasks" className="field pl-9" aria-label="Search tasks" />
          {sp.dept && <input type="hidden" name="dept" value={sp.dept} />}
          {sp.archived && <input type="hidden" name="archived" value="1" />}
        </form>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <Link href={href({ dept: undefined })} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-sm", !sp.dept ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}>
            All
          </Link>
          {departments.map((d) => (
            <Link key={d.id} href={href({ dept: d.id })} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-sm", sp.dept === d.id ? "border-line-strong bg-white/10 text-white" : "border-line text-muted hover:text-fg")}>
              {d.name} <span className="text-faint">{d.taskCount}</span>
            </Link>
          ))}
          <Link href={href({ archived: sp.archived ? undefined : "1" })} className={cx("shrink-0 rounded-full border px-3 py-1.5 text-sm", sp.archived ? "border-line-strong bg-white/10 text-white" : "border-line text-faint hover:text-fg")}>
            Archived
          </Link>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title={sp.q || sp.dept || sp.archived ? "No tasks match" : "No tasks yet"}
          description={sp.q || sp.dept || sp.archived ? "Try a different search or department." : "Create a task from one piece of work your business does every day."}
          action={
            <ButtonLink href="/tasks/new">
              <Icon name="plus" /> Create task
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([dept, list]) => (
            <section key={dept}>
              {groups.size > 1 && <h2 className="eyebrow mb-3">{dept}</h2>}
              <div className="panel divide-y divide-line overflow-hidden">
                {list.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03] md:grid-cols-[1fr_180px_90px_120px]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium text-white">{t.name}</span>
                        <span className="num text-xs text-faint">v{t.version}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-faint">{t.description || t.workflowName || "—"}</div>
                    </div>
                    <div className="hidden truncate text-sm text-muted md:block">{t.workflowName ?? ""}</div>
                    <div className="hidden text-right md:block">{t.runs > 0 ? <Badge tone="output">{t.runs} runs</Badge> : <span className="text-xs text-faint">not run</span>}</div>
                    <div className="text-right text-xs text-faint">{timeAgo(t.updatedAt)}</div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
