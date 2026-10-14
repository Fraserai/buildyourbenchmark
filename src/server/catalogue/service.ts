import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { chooseRoute, configuredLiveProviders } from "../providers/registry";
import type { Ctx } from "../auth/context";

/** Reference sources in order of preference for display. */
const INDEX_SOURCE_PREFERENCE = ["Artificial Analysis data API", "Artificial Analysis (via OpenRouter)"];

export type CatalogueModel = Awaited<ReturnType<typeof listCatalogue>>[number];

/**
 * Public catalogue view. `ctx` is only used to attach the organization's OWN
 * execution count per model — never other organizations' data.
 */
export function listCatalogue(ctx?: Ctx) {
  const db = getDb();
  const models = db
    .select({
      model: s.models,
      providerName: s.providers.name,
      providerColor: s.providers.color,
      pricing: s.modelPricingSnapshots,
    })
    .from(s.models)
    .innerJoin(s.providers, eq(s.providers.id, s.models.providerId))
    .leftJoin(s.modelPricingSnapshots, eq(s.modelPricingSnapshots.id, s.models.currentPricingSnapshotId))
    .orderBy(s.models.sortOrder)
    .all();

  const refs = db.select().from(s.modelReferenceData).orderBy(desc(s.modelReferenceData.capturedAt)).all();
  const routes = db.select().from(s.modelRoutes).all();
  const own = ctx
    ? db
        .select({ modelId: s.runModels.modelId, n: sql<number>`count(*)` })
        .from(s.runModels)
        .where(and(eq(s.runModels.organizationId, ctx.organizationId), eq(s.runModels.status, "completed")))
        .groupBy(s.runModels.modelId)
        .all()
    : [];

  return models.map(({ model, providerName, providerColor, pricing }) => {
    const modelRefs = refs.filter((r) => r.modelId === model.id);
    const indexRefs = modelRefs.filter((r) => r.metric === "aa_intelligence_index");
    const preferred =
      INDEX_SOURCE_PREFERENCE.map((src) => indexRefs.find((r) => r.source === src)).find(Boolean) ?? indexRefs[0] ?? null;
    const costRef = modelRefs.find((r) => r.metric === "aa_cost_per_index_task_usd") ?? null;
    const modelRoutes = routes.filter((r) => r.modelId === model.id);
    const priced = Boolean(pricing);
    const liveRoute = priced && model.status === "available" ? chooseRoute("live", model.id, modelRoutes, model.reasoningEffort) : null;
    return {
      ...model,
      providerName,
      providerColor,
      pricing: pricing
        ? {
            id: pricing.id,
            inputPerMTok: pricing.inputPerMTok,
            outputPerMTok: pricing.outputPerMTok,
            cacheReadPerMTok: pricing.cacheReadPerMTok,
            cacheWritePerMTok: pricing.cacheWritePerMTok,
            source: pricing.source,
            capturedAt: pricing.capturedAt,
          }
        : null,
      reference: {
        intelligenceIndex: preferred ? { value: preferred.value, source: preferred.source, version: preferred.sourceVersion, capturedAt: preferred.capturedAt } : null,
        costPerIndexTaskUsd: costRef ? { value: costRef.value, source: costRef.source, version: costRef.sourceVersion } : null,
      },
      routes: modelRoutes.map((r) => r.inferenceProvider),
      runnableLive: Boolean(liveRoute),
      liveVia: liveRoute?.inferenceProvider ?? null,
      runnableDemo: priced && (model.status === "available" || model.status === "unavailable"),
      ownCompletedRuns: own.find((o) => o.modelId === model.id)?.n ?? 0,
    };
  });
}

export function getModelDetail(modelId: string, ctx: Ctx) {
  const db = getDb();
  const model = listCatalogue(ctx).find((m) => m.id === modelId);
  if (!model) return null;
  const pricingHistory = db
    .select()
    .from(s.modelPricingSnapshots)
    .where(eq(s.modelPricingSnapshots.modelId, modelId))
    .orderBy(desc(s.modelPricingSnapshots.capturedAt))
    .all();
  const referenceHistory = db
    .select()
    .from(s.modelReferenceData)
    .where(eq(s.modelReferenceData.modelId, modelId))
    .orderBy(desc(s.modelReferenceData.capturedAt))
    .all();
  const versions = db.select().from(s.modelVersions).where(eq(s.modelVersions.modelId, modelId)).orderBy(desc(s.modelVersions.createdAt)).all();
  // The organization's own measured results for this model.
  const ownResults = db
    .select({
      runModelId: s.runModels.id,
      runId: s.runModels.runId,
      taskName: s.tasks.name,
      taskVersion: s.taskVersions.version,
      mode: s.runs.mode,
      costNanoUsd: s.runModels.costNanoUsd,
      costSource: s.runModels.costSource,
      durationMs: s.runModels.durationMs,
      completedAt: s.runModels.completedAt,
    })
    .from(s.runModels)
    .innerJoin(s.runs, eq(s.runs.id, s.runModels.runId))
    .innerJoin(s.tasks, eq(s.tasks.id, s.runs.taskId))
    .innerJoin(s.taskVersions, eq(s.taskVersions.id, s.runs.taskVersionId))
    .where(and(eq(s.runModels.organizationId, ctx.organizationId), eq(s.runModels.modelId, modelId), eq(s.runModels.status, "completed")))
    .orderBy(desc(s.runModels.completedAt))
    .limit(50)
    .all();
  return { model, pricingHistory, referenceHistory, versions, ownResults };
}

export function lastRefresh() {
  return getDb().select().from(s.catalogueRefreshes).orderBy(desc(s.catalogueRefreshes.startedAt)).limit(1).get() ?? null;
}

export function refreshHistory(limit = 10) {
  return getDb().select().from(s.catalogueRefreshes).orderBy(desc(s.catalogueRefreshes.startedAt)).limit(limit).all();
}

export function liveProviderStatus() {
  return {
    configured: configuredLiveProviders().map((p) => ({ id: p.id, name: p.name })),
    anyLive: configuredLiveProviders().length > 0,
  };
}
