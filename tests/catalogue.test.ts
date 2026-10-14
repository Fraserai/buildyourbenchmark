import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { CURATED_MODELS } from "@/server/catalogue/curated";
import { refreshCatalogue } from "@/server/catalogue/refresh";
import { listCatalogue } from "@/server/catalogue/service";
import { FakeCatalogueSource, catalogueRecords, freshDb, installProviders, seedCatalogue } from "./helpers";
import type { DB } from "@/server/db/client";

let db: DB;
beforeEach(() => {
  db = freshDb();
  installProviders();
});

describe("catalogue refresh", () => {
  it("loads every curated model and marks unpriced ones as not runnable", async () => {
    const { summary } = await seedCatalogue();
    expect(summary.newModels).toHaveLength(CURATED_MODELS.length);
    const models = listCatalogue();
    expect(models).toHaveLength(27);
    const step = models.find((m) => m.id === "step-5-preview")!;
    expect(step.status).toBe("pricing_unavailable");
    expect(step.pricing).toBeNull();
    expect(step.runnableDemo).toBe(false);
    const opus = models.find((m) => m.id === "claude-opus-5.5@max")!;
    expect(opus.status).toBe("available");
    expect(opus.pricing?.inputPerMTok).toBe("2");
  });

  it("keeps public reference data separate and prefers live values over the chart snapshot", async () => {
    await seedCatalogue();
    const opus = listCatalogue().find((m) => m.id === "claude-opus-5.5@max")!;
    expect(opus.reference.intelligenceIndex?.value).toBeCloseTo(58.1);
    expect(opus.reference.intelligenceIndex?.source).toBe("Artificial Analysis (via OpenRouter)");
    const step = listCatalogue().find((m) => m.id === "step-5-preview")!;
    expect(step.reference.intelligenceIndex?.value).toBe(44);
  });

  it("creates a new pricing snapshot on change and never mutates old snapshots", async () => {
    await seedCatalogue();
    const first = db.select().from(s.modelPricingSnapshots).where(eq(s.modelPricingSnapshots.modelId, "glm-5.3@max")).all();
    expect(first).toHaveLength(1);
    await seedCatalogue(); // unchanged → no new snapshot
    expect(db.select().from(s.modelPricingSnapshots).where(eq(s.modelPricingSnapshots.modelId, "glm-5.3@max")).all()).toHaveLength(1);

    const { summary } = await seedCatalogue({ "z-ai/glm-5.3": { pricing: { inputPerMTok: "3", outputPerMTok: "12", cacheReadPerMTok: null, cacheWritePerMTok: null } } });
    expect(summary.priceChanges.map((c) => c.modelId)).toEqual(["glm-5.3@max"]);
    const all = db.select().from(s.modelPricingSnapshots).where(eq(s.modelPricingSnapshots.modelId, "glm-5.3@max")).all();
    expect(all).toHaveLength(2);
    expect(all.find((p) => p.id === first[0].id)).toEqual(first[0]);
    expect(listCatalogue().find((m) => m.id === "glm-5.3@max")!.pricing?.inputPerMTok).toBe("3");
  });

  it("marks models that vanish upstream unavailable without deleting them", async () => {
    await seedCatalogue();
    const records = catalogueRecords().filter((r) => r.sourceId !== "x-ai/grok-4.6");
    await refreshCatalogue({ trigger: "test", sources: [new FakeCatalogueSource(records)] });
    const grok = listCatalogue().find((m) => m.id === "grok-4.6@high")!;
    expect(grok.status).toBe("unavailable");
    expect(grok.pricing).not.toBeNull();
  });

  it("leaves the catalogue untouched when a source is down", async () => {
    await seedCatalogue();
    const before = listCatalogue().map((m) => [m.id, m.status, m.pricing?.id]);
    const res = await refreshCatalogue({ trigger: "test", sources: [new FakeCatalogueSource([], true)] });
    expect(res.sources[0].ok).toBe(false);
    expect(listCatalogue().map((m) => [m.id, m.status, m.pricing?.id])).toEqual(before);
  });

  it("versions model identity when the upstream model changes", async () => {
    await seedCatalogue();
    await seedCatalogue({ "anthropic/claude-opus-5.5": { canonicalId: "anthropic/claude-opus-5.5-20261001" } });
    const versions = db.select().from(s.modelVersions).where(eq(s.modelVersions.modelId, "claude-opus-5.5@max")).all();
    expect(versions).toHaveLength(2);
  });
});
