/**
 * Catalogue refresh: pulls public model facts from sources and folds them into
 * the catalogue without ever rewriting history.
 *
 *  - new curated models are inserted
 *  - configuration/identity changes create a new model_version
 *  - price changes create a new pricing snapshot (old snapshots are never touched)
 *  - models missing upstream are marked unavailable, never deleted
 *  - a failing source leaves existing data as-is
 */
import { and, desc, eq, notInArray } from "drizzle-orm";
import { getDb, type DB } from "../db/client";
import * as s from "../db/schema";
import { canonicalJson, newId, sha256 } from "../ids";
import { log } from "../log";
import {
  CURATED_MODELS,
  PROVIDERS,
  REFERENCE_CHART_CAPTURED_AT,
  REFERENCE_CHART_SOURCE,
  REFERENCE_CHART_VERSION,
  type CuratedModel,
} from "./curated";
import { ArtificialAnalysisSource } from "./sources/artificial-analysis";
import { OpenRouterCatalogueSource } from "./sources/openrouter";
import type { CatalogueSource, SourceModelRecord } from "./sources/types";

export function defaultSources(): CatalogueSource[] {
  const sources: CatalogueSource[] = [new OpenRouterCatalogueSource()];
  if (process.env.ARTIFICIAL_ANALYSIS_API_KEY) {
    sources.push(new ArtificialAnalysisSource(process.env.ARTIFICIAL_ANALYSIS_API_KEY));
  }
  return sources;
}

export type RefreshSummary = {
  newModels: string[];
  newVersions: string[];
  priceChanges: { modelId: string; from: string | null; to: string }[];
  statusChanges: { modelId: string; from: string | null; to: string }[];
  referenceUpdates: number;
  discoveredUpstream: string[];
};

type FetchedSource = { source: CatalogueSource; ok: boolean; error?: string; byKey: Map<string, SourceModelRecord> };

export async function refreshCatalogue(opts: {
  trigger: string;
  sources?: CatalogueSource[];
  db?: DB;
  now?: number;
}): Promise<{ refreshId: string; summary: RefreshSummary; sources: { name: string; ok: boolean; error?: string }[] }> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? Date.now();
  const refreshId = newId("ref");
  db.insert(s.catalogueRefreshes).values({ id: refreshId, trigger: opts.trigger, status: "running", startedAt: now }).run();

  const fetched: FetchedSource[] = [];
  for (const source of opts.sources ?? defaultSources()) {
    try {
      const records = await source.fetchModels(AbortSignal.timeout(30_000));
      fetched.push({ source, ok: true, byKey: new Map(records.map((r) => [r.sourceId, r])) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn("catalogue source failed", { source: source.name, error });
      fetched.push({ source, ok: false, error, byKey: new Map() });
    }
  }

  try {
    const summary = db.transaction((tx) => applyRefresh(tx as unknown as DB, fetched, now));
    const sourceStatus = fetched.map((f) => ({ name: f.source.name, ok: f.ok, error: f.error, records: f.byKey.size }));
    db.update(s.catalogueRefreshes)
      .set({ status: "completed", completedAt: Date.now(), summary, sources: sourceStatus })
      .where(eq(s.catalogueRefreshes.id, refreshId))
      .run();
    return { refreshId, summary, sources: sourceStatus };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.update(s.catalogueRefreshes)
      .set({ status: "failed", completedAt: Date.now(), error })
      .where(eq(s.catalogueRefreshes.id, refreshId))
      .run();
    throw err;
  }
}

type ModelStatus = (typeof s.models.$inferSelect)["status"];

function recordFor(f: FetchedSource, m: CuratedModel): SourceModelRecord | undefined {
  if (f.source.keyField === "openrouterId") return m.openrouterId ? f.byKey.get(m.openrouterId) : undefined;
  return f.byKey.get(m.name);
}

function applyRefresh(db: DB, fetched: FetchedSource[], now: number): RefreshSummary {
  const summary: RefreshSummary = {
    newModels: [],
    newVersions: [],
    priceChanges: [],
    statusChanges: [],
    referenceUpdates: 0,
    discoveredUpstream: [],
  };

  for (const p of PROVIDERS) {
    db.insert(s.providers)
      .values({ ...p, createdAt: now })
      .onConflictDoUpdate({ target: s.providers.id, set: { name: p.name, color: p.color } })
      .run();
  }

  const primary = fetched.find((f) => f.source.keyField === "openrouterId");

  CURATED_MODELS.forEach((m, index) => {
    const records = fetched.map((f) => ({ f, r: recordFor(f, m) }));
    const or = primary ? recordFor(primary, m) : undefined;
    const existing = db.select().from(s.models).where(eq(s.models.id, m.id)).get();

    const weights = or?.openWeights ? "open" : m.weightsDefault;
    const fields = {
      providerId: m.providerId,
      name: m.name,
      variant: m.variant,
      weights: weights as "open" | "closed" | "unknown",
      reasoningEffort: m.reasoningEffort,
      sortOrder: index,
      contextLength: or?.contextLength ?? existing?.contextLength ?? null,
      maxOutputTokens: or?.maxOutputTokens ?? existing?.maxOutputTokens ?? null,
      inputModalities: or?.inputModalities ?? existing?.inputModalities ?? ["text"],
      description: or?.description ?? existing?.description ?? null,
      updatedAt: now,
    };

    if (!existing) {
      db.insert(s.models)
        .values({ id: m.id, ...fields, status: "pricing_unavailable", firstSeenAt: now, lastSeenAt: or ? now : null })
        .run();
      summary.newModels.push(m.id);
    } else {
      db.update(s.models)
        .set({ ...fields, ...(or ? { lastSeenAt: now } : {}) })
        .where(eq(s.models.id, m.id))
        .run();
    }

    // --- Routes (how the model can be executed) --------------------------------
    if (m.openrouterId) {
      upsertRoute(db, m.id, "openrouter", m.openrouterId, m.reasoningEffort ? { reasoningEffort: m.reasoningEffort } : {}, now);
    }
    if (m.anthropicId) {
      upsertRoute(
        db,
        m.id,
        "anthropic",
        m.anthropicId,
        { ...(m.reasoningEffort ? { reasoningEffort: m.reasoningEffort } : {}), ...(m.anthropicFallback ? { fallback: "default" } : {}) },
        now,
      );
    }

    // --- Version (identity + run configuration) ------------------------------
    const config = {
      upstream: or?.canonicalId ?? null,
      reasoningEffort: m.reasoningEffort,
      anthropicId: m.anthropicId ?? null,
      fallback: m.anthropicFallback ? "default" : null,
    };
    const configHash = sha256(canonicalJson(config)).slice(0, 32);
    let version = db
      .select()
      .from(s.modelVersions)
      .where(and(eq(s.modelVersions.modelId, m.id), eq(s.modelVersions.configHash, configHash)))
      .get();
    if (!version) {
      version = { id: newId("mv"), modelId: m.id, upstreamId: config.upstream, config, configHash, createdAt: now };
      db.insert(s.modelVersions).values(version).run();
      summary.newVersions.push(m.id);
    }

    // --- Pricing (append-only snapshots) --------------------------------------
    const current = db
      .select()
      .from(s.modelPricingSnapshots)
      .where(eq(s.modelPricingSnapshots.modelId, m.id))
      .orderBy(desc(s.modelPricingSnapshots.capturedAt))
      .limit(1)
      .get();
    let pricingSnapshotId = current?.id ?? null;
    if (or?.pricing && primary) {
      const contentHash = sha256(canonicalJson({ currency: "USD", ...or.pricing }));
      if (!current || current.contentHash !== contentHash) {
        pricingSnapshotId = newId("price");
        db.insert(s.modelPricingSnapshots)
          .values({
            id: pricingSnapshotId,
            modelId: m.id,
            currency: "USD",
            ...or.pricing,
            source: primary.source.name,
            sourceRef: or.sourceId,
            contentHash,
            capturedAt: now,
          })
          .run();
        summary.priceChanges.push({
          modelId: m.id,
          from: current ? `${current.inputPerMTok}/${current.outputPerMTok}` : null,
          to: `${or.pricing.inputPerMTok}/${or.pricing.outputPerMTok}`,
        });
      }
    }

    // --- Status ------------------------------------------------------------------
    let status: ModelStatus;
    let statusReason: string | null = null;
    if (or?.pricing) {
      status = "available";
    } else if (!m.openrouterId) {
      status = pricingSnapshotId ? "available" : "pricing_unavailable";
      statusReason = pricingSnapshotId ? null : "No public per-token pricing from any catalogue source yet.";
    } else if (primary && !primary.ok) {
      status = existing?.status ?? "pricing_unavailable";
      statusReason = existing?.statusReason ?? "Catalogue source unreachable.";
    } else if (!or) {
      status = pricingSnapshotId ? "unavailable" : "pricing_unavailable";
      statusReason = "No longer listed by the upstream catalogue.";
    } else {
      status = "pricing_unavailable";
      statusReason = "Listed upstream without per-token pricing.";
    }
    if (existing?.status !== status) summary.statusChanges.push({ modelId: m.id, from: existing?.status ?? null, to: status });
    db.update(s.models)
      .set({
        status,
        statusReason,
        currentVersionId: version.id,
        currentPricingSnapshotId: pricingSnapshotId,
      })
      .where(eq(s.models.id, m.id))
      .run();

    // --- Public reference data -------------------------------------------------
    summary.referenceUpdates += recordReference(db, m.id, "aa_intelligence_index", m.reference.intelligenceIndex, REFERENCE_CHART_SOURCE, REFERENCE_CHART_VERSION, REFERENCE_CHART_CAPTURED_AT);
    if (m.reference.costPerIndexTaskUsd != null) {
      summary.referenceUpdates += recordReference(db, m.id, "aa_cost_per_index_task_usd", m.reference.costPerIndexTaskUsd, REFERENCE_CHART_SOURCE, REFERENCE_CHART_VERSION, REFERENCE_CHART_CAPTURED_AT);
    }
    for (const { f, r } of records) {
      for (const ref of r?.reference ?? []) {
        const sourceLabel = f.source.keyField === "openrouterId" ? "Artificial Analysis (via OpenRouter)" : f.source.name;
        summary.referenceUpdates += recordReference(db, m.id, ref.metric, ref.value, sourceLabel, ref.sourceVersion ?? null, now);
      }
    }
  });

  // Models no longer curated stay in the catalogue (history depends on them) but are deprecated.
  const curatedIds = CURATED_MODELS.map((m) => m.id);
  db.update(s.models)
    .set({ status: "deprecated", statusReason: "Removed from the platform catalogue.", updatedAt: now })
    .where(notInArray(s.models.id, curatedIds))
    .run();

  if (primary?.ok) {
    const curatedUpstream = new Set(CURATED_MODELS.map((m) => m.openrouterId).filter(Boolean));
    const namespaces = new Set(CURATED_MODELS.map((m) => m.openrouterId?.split("/")[0]).filter(Boolean));
    summary.discoveredUpstream = [...primary.byKey.keys()]
      .filter((k) => namespaces.has(k.split("/")[0]) && !curatedUpstream.has(k) && !k.includes(":") && !k.startsWith("~"))
      .slice(0, 100);
  }

  return summary;
}

function upsertRoute(db: DB, modelId: string, inferenceProvider: string, providerModelId: string, params: Record<string, unknown>, now: number) {
  db.insert(s.modelRoutes)
    .values({ id: newId("route"), modelId, inferenceProvider, providerModelId, params, updatedAt: now })
    .onConflictDoUpdate({
      target: [s.modelRoutes.modelId, s.modelRoutes.inferenceProvider],
      set: { providerModelId, params, updatedAt: now },
    })
    .run();
}

/** Insert a reference value only when it differs from the latest value from the same source. */
function recordReference(db: DB, modelId: string, metric: string, value: number, source: string, sourceVersion: string | null, capturedAt: number): number {
  const latest = db
    .select()
    .from(s.modelReferenceData)
    .where(and(eq(s.modelReferenceData.modelId, modelId), eq(s.modelReferenceData.metric, metric), eq(s.modelReferenceData.source, source)))
    .orderBy(desc(s.modelReferenceData.capturedAt))
    .limit(1)
    .get();
  if (latest && latest.value === value) return 0;
  db.insert(s.modelReferenceData).values({ id: newId("refd"), modelId, metric, value, source, sourceVersion, capturedAt }).run();
  return 1;
}
