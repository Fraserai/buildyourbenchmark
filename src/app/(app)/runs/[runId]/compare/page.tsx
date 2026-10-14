import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/server/auth/next";
import { getRun } from "@/server/runs/service";
import { NotFoundError } from "@/server/auth/context";
import { CompareView, type CompareColumn } from "@/components/compare-view";
import { EmptyState, ModeBadge, PageHeader } from "@/components/ui";

export const metadata = { title: "Compare outputs" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: Promise<{ m?: string }> }) {
  const { ctx } = await requireCtx();
  const { runId } = await params;
  const sp = await searchParams;
  let view;
  try {
    view = getRun(ctx, runId, { fullOutput: true });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const all: CompareColumn[] = view.models
    .filter((m) => m.status === "completed" && m.artifact)
    .map((m) => ({
      id: m.id,
      artifactId: m.artifact!.id,
      modelName: m.modelName,
      modelVariant: m.modelVariant,
      providerColor: m.providerColor,
      costNanoUsd: m.costNanoUsd,
      durationMs: m.durationMs,
      outputTokens: m.outputTokens,
      content: m.artifact!.content ?? "",
      artifactType: m.artifact!.artifactType,
    }));
  const requested = (sp.m ?? "").split(",").filter((id) => all.some((c) => c.id === id));

  return (
    <div>
      <Link href={`/runs/${runId}`} className="text-sm text-muted hover:text-fg">
        ← Run results
      </Link>
      <div className="mt-5">
        <PageHeader
          eyebrow={
            <span className="flex items-center gap-2">
              Compare outputs · {view.task.name} · v{view.version.version} <ModeBadge mode={view.run.mode} />
            </span>
          }
          title="Side by side"
          description="The exact outputs, next to each other. No scores, no winner. Your team decides what meets the bar."
        />
      </div>
      {all.length === 0 ? <EmptyState title="No completed outputs yet" description="Outputs appear here once models finish." /> : <CompareView columns={requested} all={all} demo={view.run.mode === "demo"} />}
    </div>
  );
}
