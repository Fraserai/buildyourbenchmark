import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getTask, getTaskVersion } from "@/server/tasks/service";
import { listCatalogue, liveProviderStatus } from "@/server/catalogue/service";
import { getRun } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";
import { ModelPicker } from "@/components/model-picker";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Select models" };

export default async function RunTask({ params, searchParams }: { params: Promise<{ taskId: string }>; searchParams: Promise<{ from?: string }> }) {
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
  const { version, files } = getTaskVersion(ctx, t.task.currentVersionId!);
  const chars = version.instructions.length + version.inputText.length + files.reduce((n, f) => n + (f.extractedText?.length ?? 0), 0);
  const images = files.filter((f) => f.kind === "image").length;

  let initialSelection: string[] = [];
  if (sp.from) {
    try {
      initialSelection = getRun(ctx, sp.from).models.map((m) => m.modelId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <Link href={`/tasks/${taskId}`} className="text-sm text-muted hover:text-fg">
        ← {t.task.name}
      </Link>
      <div className="mt-5">
        <PageHeader eyebrow="Step 2 of 3 · Select models" title="Who should do this work?" description="Choose exactly the models you want to test. The same task runs on each; you'll see the actual price, time and output of every one." />
      </div>
      <ModelPicker
        task={{ id: taskId, versionId: version.id, version: version.version, name: t.task.name, approxInputTokens: Math.ceil(chars / 4) + images * 1100, hasImages: images > 0 }}
        models={listCatalogue(ctx)}
        liveProviders={liveProviderStatus().configured.map((p) => p.name)}
        initialSelection={initialSelection}
      />
    </div>
  );
}
