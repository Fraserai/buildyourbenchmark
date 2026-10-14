import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getTask, getTaskVersion } from "@/server/tasks/service";
import { listDepartments, listWorkflowNames } from "@/server/orgs/service";
import { ACCEPTED_EXTENSIONS } from "@/server/tasks/files";
import { NotFoundError } from "@/server/auth/context";
import { TaskForm } from "@/components/task-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit task" };

export default async function EditTask({ params }: { params: Promise<{ taskId: string }> }) {
  const { ctx } = await requireCtx();
  const { taskId } = await params;
  let t;
  try {
    t = getTask(ctx, taskId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { version, files } = getTaskVersion(ctx, t.task.currentVersionId!);
  return (
    <div>
      <Link href={`/tasks/${taskId}`} className="text-sm text-muted hover:text-fg">
        ← {t.task.name}
      </Link>
      <div className="mt-5">
        <PageHeader eyebrow={`Edit · currently v${version.version}`} title={t.task.name} />
      </div>
      <TaskForm
        departments={listDepartments(ctx).map((d) => d.name)}
        workflows={[...new Set(listWorkflowNames(ctx).map((w) => w.name))]}
        accept={ACCEPTED_EXTENSIONS}
        initial={{
          taskId,
          name: t.task.name,
          description: t.task.description,
          departmentName: t.department?.name,
          workflowName: t.workflow?.name,
          tags: t.task.tags,
          instructions: version.instructions,
          inputText: version.inputText,
          maxOutputTokens: version.maxOutputTokens,
          version: version.version,
          files: files.map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.sizeBytes, role: f.role, kind: f.kind, extractionMethod: f.extractionMethod })),
        }}
      />
    </div>
  );
}
