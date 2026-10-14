import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import type { DB } from "@/server/db/client";
import { createTask, updateTask } from "@/server/tasks/service";
import { createRun, getRun, getRunInput, listRuns, requestCancel } from "@/server/runs/service";
import { drainQueue } from "@/server/jobs/worker";
import { claimNext, HEARTBEAT_STALE_MS, takeAbandoned } from "@/server/jobs/queue";
import { failAbandoned } from "@/server/runs/executor";
import { ProviderError } from "@/server/providers/types";
import { processUpload } from "@/server/tasks/files";
import { ScriptedProvider, freshDb, installProviders, makeOrg, seedCatalogue } from "./helpers";
import type { Ctx } from "@/server/auth/context";

let db: DB;
let ctx: Ctx;
let openrouter: ScriptedProvider;
let anthropic: ScriptedProvider;

beforeEach(async () => {
  db = freshDb();
  openrouter = new ScriptedProvider("openrouter");
  anthropic = new ScriptedProvider("anthropic");
  installProviders(openrouter, anthropic);
  await seedCatalogue();
  ctx = await makeOrg("Morris Blackburn");
});

async function realisticTask() {
  const email = await processUpload("enquiry.txt", "text/plain", Buffer.from("Dear team, I was injured at work and my employer has not responded..."));
  return createTask(
    ctx,
    {
      name: "Review new client matter",
      departmentName: "Legal",
      instructions: "Review the client enquiry. Identify the matter type, key facts, limitation risks and prepare the initial response per our intake procedure.",
      inputText: "New enquiry received via website form.",
    },
    [{ ...email, role: "input" }],
  );
}

describe("run execution", () => {
  it("runs the same task against three models and records price, time and output", async () => {
    openrouter.behaviors["z-ai/glm-5.3"] = { text: "GLM output", providerCostUsd: 0.031234, delayMs: 30 };
    openrouter.behaviors["google/gemini-3.8-flash"] = { text: "# Gemini\n- point", delayMs: 10 };
    anthropic.behaviors["claude-opus-5-5"] = { text: "Claude output", delayMs: 20 };
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["claude-opus-5.5@max", "gemini-3.8-flash@high", "glm-5.3@max"], mode: "live" });

    expect(getRun(ctx, runId).run.status).toBe("queued");
    await drainQueue();
    const view = getRun(ctx, runId, { fullOutput: true });
    expect(view.run.status).toBe("completed");
    expect(view.models.map((m) => m.status)).toEqual(["completed", "completed", "completed"]);

    // Same task definition + inputs to every model.
    const hashes = new Set([...openrouter.calls, ...anthropic.calls].map((c) => c.hash));
    expect(hashes.size).toBe(1);
    expect([...hashes][0]).toBe(view.run.payloadHash);
    expect(view.models.every((m) => m.payloadHash === view.run.payloadHash)).toBe(true);
    expect((await getRunInput(ctx, runId)).matches).toBe(true);

    // Routing honours central priority: Claude went direct, others via OpenRouter.
    expect(view.models[0].inferenceProvider).toBe("anthropic");
    expect(anthropic.calls[0].params).toMatchObject({ reasoningEffort: "max", fallback: "default" });
    expect(openrouter.calls.find((c) => c.providerModelId === "z-ai/glm-5.3")!.params).toMatchObject({ reasoningEffort: "max" });

    // PRICE: provider-billed when reported, else usage × frozen snapshot ($2 in / $10 out in the fixture).
    const glm = view.models.find((m) => m.modelId === "glm-5.3@max")!;
    expect(glm.costSource).toBe("provider_billed");
    expect(glm.costNanoUsd).toBe(31_234_000);
    expect(glm.calculatedCostNanoUsd).toBe(12341 * 2000 + 1242 * 10000); // nano: tokens × $/M ⇒ 1e9/1e6
    const gemini = view.models.find((m) => m.modelId === "gemini-3.8-flash@high")!;
    expect(gemini.costSource).toBe("calculated");
    expect(gemini.costNanoUsd).toBe(12341 * 2000 + 1242 * 10000);
    expect(gemini.inputTokens).toBe(12341);
    expect(gemini.outputTokens).toBe(1242);

    // TIME
    for (const m of view.models) {
      expect(m.durationMs).toBeGreaterThanOrEqual(5);
      expect(m.startedAt).toBeTruthy();
      expect(m.completedAt).toBeGreaterThanOrEqual(m.startedAt!);
    }
    expect(glm.durationMs).toBeGreaterThanOrEqual(25);

    // OUTPUT persisted verbatim
    expect(glm.artifact!.content).toBe("GLM output");
    expect(gemini.artifact!.artifactType).toBe("markdown");
    expect(db.select().from(s.usageLedger).all()).toHaveLength(3);
  });

  it("keeps successful results when one model fails (partial run)", async () => {
    openrouter.behaviors["x-ai/grok-4.7"] = { failWith: new ProviderError("Upstream error: model overloaded", "http_400", false, 400) };
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max", "grok-4.7@xhigh", "minimax-m3"], mode: "live" });
    await drainQueue();
    const view = getRun(ctx, runId);
    expect(view.run.status).toBe("partial");
    const grok = view.models.find((m) => m.modelId === "grok-4.7@xhigh")!;
    expect(grok.status).toBe("failed");
    expect(grok.errorMessage).toContain("overloaded");
    expect(grok.artifact).toBeNull();
    expect(grok.costNanoUsd).toBeNull();
    expect(view.models.filter((m) => m.status === "completed")).toHaveLength(2);
    expect(view.models.find((m) => m.modelId === "glm-5.3@max")!.artifact).not.toBeNull();
  });

  it("marks a run failed when every model fails", async () => {
    openrouter.behaviors["z-ai/glm-5.3"] = { failWith: new ProviderError("bad", "http_400", false) };
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    expect(getRun(ctx, runId).run.status).toBe("failed");
  });

  it("retries transient provider errors and records attempts", async () => {
    openrouter.behaviors["z-ai/glm-5.3"] = { failWith: new ProviderError("rate limited", "http_429", true, 429), failTimes: 1 };
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    const m = getRun(ctx, runId).models[0];
    expect(m.status).toBe("completed");
    expect(m.attempts).toBe(2);
  }, 15000);

  it("never changes a historical cost when pricing changes later", async () => {
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    const before = getRun(ctx, runId).models[0];

    await seedCatalogue({ "z-ai/glm-5.3": { pricing: { inputPerMTok: "20", outputPerMTok: "100", cacheReadPerMTok: null, cacheWritePerMTok: null } } });
    const after = getRun(ctx, runId).models[0];
    expect(after.costNanoUsd).toBe(before.costNanoUsd);
    expect(after.pricingSnapshotId).toBe(before.pricingSnapshotId);
    expect(after.pricingSnapshot?.inputPerMTok).toBe("2");

    // A new run picks up the new snapshot.
    const { runId: run2 } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    const newer = getRun(ctx, run2).models[0];
    expect(newer.pricingSnapshotId).not.toBe(before.pricingSnapshotId);
    expect(newer.costNanoUsd).toBe(12341 * 20000 + 1242 * 100000);
  });

  it("pins a run to the task version it executed", async () => {
    const { taskId, versionId: v1 } = await realisticTask();
    const { runId: r1 } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();
    const hash1 = getRun(ctx, r1).run.payloadHash;

    const u = await updateTask(ctx, taskId, { name: "Review new client matter", instructions: "Revised instructions v2", keepFileIds: [] });
    expect(u.version).toBe(2);
    const { runId: r2 } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    await drainQueue();

    const run1 = getRun(ctx, r1);
    const run2 = getRun(ctx, r2);
    expect(run1.run.taskVersionId).toBe(v1);
    expect(run1.version.version).toBe(1);
    expect(run1.run.payloadHash).toBe(hash1);
    expect(run2.version.version).toBe(2);
    expect(run2.run.payloadHash).not.toBe(hash1);
    expect((await getRunInput(ctx, r1)).system).toContain("Identify the matter type");
  });

  it("runs concurrent runs independently", async () => {
    openrouter.behaviors["z-ai/glm-5.3"] = { delayMs: 40 };
    openrouter.behaviors["minimax/minimax-m3"] = { delayMs: 10 };
    const { taskId } = await realisticTask();
    const runs = await Promise.all([1, 2, 3].map(() => createRun(ctx, { taskId, modelIds: ["glm-5.3@max", "minimax-m3"], mode: "live" })));
    const t0 = Date.now();
    await drainQueue();
    // All six executions ran in parallel, not one after another.
    expect(Date.now() - t0).toBeLessThan(40 * 6);
    for (const { runId } of runs) {
      const v = getRun(ctx, runId);
      expect(v.run.status).toBe("completed");
      expect(v.models.every((m) => m.artifact)).toBe(true);
    }
    expect(listRuns(ctx)).toHaveLength(3);
  });

  it("cancels queued executions without fabricating results", async () => {
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max", "minimax-m3"], mode: "live" });
    requestCancel(ctx, runId);
    await drainQueue();
    const v = getRun(ctx, runId);
    expect(v.run.status).toBe("cancelled");
    expect(v.models.every((m) => m.status === "cancelled" && m.artifact === null)).toBe(true);
    expect(openrouter.calls).toHaveLength(0);
  });

  it("fails executions abandoned by a dead worker instead of re-running them", async () => {
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" });
    const job = claimNext("dead-worker")!;
    db.update(s.jobs).set({ lockedAt: Date.now() - HEARTBEAT_STALE_MS - 1000 }).where(eq(s.jobs.id, job.id)).run();
    for (const j of takeAbandoned()) failAbandoned(String(j.payload.runModelId));
    const m = getRun(ctx, runId).models[0];
    expect(m.status).toBe("failed");
    expect(m.errorCode).toBe("interrupted");
  });

  it("labels demo runs as simulated and never calls live providers", async () => {
    const { taskId } = await realisticTask();
    const { runId } = await createRun(ctx, { taskId, modelIds: ["glm-5.3@max", "gpt-6-luna@max"], mode: "demo" });
    await drainQueue();
    const v = getRun(ctx, runId, { fullOutput: true });
    expect(v.run.mode).toBe("demo");
    expect(v.models.every((m) => m.costSource === "simulated" && m.inferenceProvider === "demo")).toBe(true);
    expect(v.models[0].artifact!.content).toContain("Simulated output");
    expect(openrouter.calls).toHaveLength(0);
    expect(db.select().from(s.usageLedger).all()).toHaveLength(0);
  });

  it("refuses models that cannot be measured", async () => {
    const { taskId } = await realisticTask();
    await expect(createRun(ctx, { taskId, modelIds: ["step-5-preview"], mode: "live" })).rejects.toThrow(/pricing/);
    await expect(createRun(ctx, { taskId, modelIds: [], mode: "live" })).rejects.toThrow();
    await expect(createRun(ctx, { taskId, modelIds: ["nope"], mode: "live" })).rejects.toThrow(/Unknown model/);
  });

  it("refuses live runs when no provider is configured", async () => {
    installProviders();
    const { taskId } = await realisticTask();
    await expect(createRun(ctx, { taskId, modelIds: ["glm-5.3@max"], mode: "live" })).rejects.toThrow(/provider/);
  });
});
