import { requireCtx } from "@/server/auth/next";
import { lastRefresh, listCatalogue } from "@/server/catalogue/service";
import { CatalogueTable } from "@/components/catalogue-table";
import { PageHeader } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Models" };

export default async function ModelsPage() {
  const { ctx } = await requireCtx();
  const models = listCatalogue(ctx);
  const refresh = lastRefresh();
  const available = models.filter((m) => m.status === "available").length;

  return (
    <div>
      <PageHeader
        eyebrow="Model catalogue"
        title="Current models"
        description={`${models.length} models from ${new Set(models.map((m) => m.providerId)).size} providers · ${available} available to run. Prices and reference scores are public data, refreshed automatically.`}
        actions={<span className="text-xs text-faint">Last refreshed {timeAgo(refresh?.completedAt ?? refresh?.startedAt)}</span>}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="panel-flat p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Public reference data</div>
          <p className="mt-1.5 text-sm text-muted">
            What is known publicly about a model: list prices, context window, benchmark scores such as the Artificial Analysis Intelligence Index. Useful context. <span className="text-fg">Not a measurement of your work.</span>
          </p>
        </div>
        <div className="panel-flat border-output/20 bg-output/[0.04] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-output">Your results</div>
          <p className="mt-1.5 text-sm text-muted">
            What actually happened when <span className="text-fg">your</span> task ran on a model: the real price, the real time and the exact output. These live on your runs, never mixed into this table.
          </p>
        </div>
      </div>

      <CatalogueTable models={models} />
    </div>
  );
}
