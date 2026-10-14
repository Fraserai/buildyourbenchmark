import Link from "next/link";
import { requireCtx } from "@/server/auth/next";
import { listDepartments, listWorkflowNames } from "@/server/orgs/service";
import { ACCEPTED_EXTENSIONS } from "@/server/tasks/files";
import { TaskForm } from "@/components/task-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Create task" };

export default async function NewTask() {
  const { ctx } = await requireCtx();
  const departments = listDepartments(ctx).map((d) => d.name);
  const workflows = [...new Set(listWorkflowNames(ctx).map((w) => w.name))];
  return (
    <div>
      <Link href="/tasks" className="text-sm text-muted hover:text-fg">
        ← Tasks
      </Link>
      <div className="mt-5">
        <PageHeader eyebrow="Step 1 of 3 · Create task" title="What work should AI do?" description="Enter the exact work: the instructions your team follows and the real inputs. Only name and instructions are required." />
      </div>
      <TaskForm departments={departments} workflows={workflows} accept={ACCEPTED_EXTENSIONS} />
    </div>
  );
}
