/**
 * Section 48 — final product test, end to end through the real services:
 * realistic task → 3 models (one fails) → verify every guarantee → new task
 * version → rerun → first run still tied to v1.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/server/db/schema";
import { processUpload } from "@/server/tasks/files";
import { createTask, getTaskVersion, updateTask } from "@/server/tasks/service";
import { createRun, getArtifact, getRun, getRunInput, listRuns } from "@/server/runs/service";
import { drainQueue } from "@/server/jobs/worker";
import { calculateTaskCost } from "@/server/pricing/cost";
import { ProviderError } from "@/server/providers/types";
import { getDb } from "@/server/db/client";
import { ScriptedProvider, freshDb, installProviders, makeOrg, seedCatalogue } from "./helpers";
import type { Ctx } from "@/server/auth/context";

const MODELS = ["claude-opus-5.5@max", "gpt-6-sol@max", "glm-5.3@max"];

describe("final product test", () => {
  let ctx: Ctx;
  let or: ScriptedProvider;
  let an: ScriptedProvider;
  let taskId: string;
  let v1: string;
  let run1: string;

  beforeAll(async () => {
    freshDb();
    or = new ScriptedProvider("openrouter", {
      "openai/gpt-6-sol": { failWith: new ProviderError("OpenRouter HTTP 400: context length exceeded", "http_400", false, 400) },
      "z-ai/glm-5.3": {
        text: "## Matter type\nWorkers' compensation\n\n## Reply\nDear Jordan, thank you for contacting Morris Blackburn…",
        usage: { inputTokens: 1822, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 2410, reasoningTokens: 1650 },
        providerCostUsd: 0.013163,
        delayMs: 25,
      },
    });
    an = new ScriptedProvider("anthropic", {
      "claude-opus-5-5": {
        text: "**Matter type:** Workers' compensation (injury at work, 3 March 2026)…",
        usage: { inputTokens: 1790, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 3120, reasoningTokens: 2200 },
        delayMs: 40,
      },
    });
    installProviders(or, an);
    await seedCatalogue();
    ctx = await makeOrg("Morris Blackburn");

    // 1. Create a realistic task
    const enquiry = await processUpload("enquiry.eml", "message/rfc822", Buffer.from("From: Jordan Lee\nSubject: Hurt at work\n\nA pallet racking shelf collapsed on 3 March…"));
    const procedure = await processUpload("intake-procedure.md", "text/markdown", Buffer.from("# Intake procedure v4\n- Acknowledge within 1 business day\n- No legal advice before conflict check"));
    ({ taskId, versionId: v1 } = await createTask(
      ctx,
      {
        name: "Review new client matter",
        departmentName: "Legal",
        workflowName: "New Client Intake",
        instructions: "Identify matter type, summarise key facts, flag limitation risk, list documents needed, draft the initial reply per the intake procedure.",
        inputText: "New enquiry received via website form.",
      },
      [
        { ...enquiry, role: "input" },
        { ...procedure, role: "reference" },
      ],
    ));

    // 2. Select 3 models and run
    ({ runId: run1 } = await createRun(ctx, { taskId, modelIds: MODELS, mode: "live" }));
    await drainQueue();
  });

  it("used the same task definition and inputs for every model", async () => {
    const view = getRun(ctx, run1);
    const calls = [...or.calls, ...an.calls];
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.hash))).toEqual(new Set([view.run.payloadHash]));
    const first = JSON.stringify(calls[0].payload);
    for (const c of calls) expect(JSON.stringify(c.payload)).toBe(first);
    const input = await getRunInput(ctx, run1);
    expect(input.matches).toBe(true);
    expect(input.user).toContain('<document name="intake-procedure.md" role="reference">');
  });

  it("executed each model and kept successes despite one failure", () => {
    const view = getRun(ctx, run1);
    expect(view.run.status).toBe("partial");
    const byModel = Object.fromEntries(view.models.map((m) => [m.modelId, m]));
    expect(byModel["claude-opus-5.5@max"].status).toBe("completed");
    expect(byModel["glm-5.3@max"].status).toBe("completed");
    expect(byModel["gpt-6-sol@max"].status).toBe("failed");
    expect(byModel["gpt-6-sol@max"].errorMessage).toContain("context length exceeded");
    expect(byModel["gpt-6-sol@max"].artifact).toBeNull();
  });

  it("captured actual usage and calculated actual cost", () => {
    const view = getRun(ctx, run1);
    const opus = view.models.find((m) => m.modelId === "claude-opus-5.5@max")!;
    expect([opus.inputTokens, opus.outputTokens, opus.reasoningTokens]).toEqual([1790, 3120, 2200]);
    expect(opus.costSource).toBe("calculated");
    const snap = getDb().select().from(s.modelPricingSnapshots).where(eq(s.modelPricingSnapshots.id, opus.pricingSnapshotId!)).get()!;
    expect(opus.costNanoUsd).toBe(calculateTaskCost({ inputTokens: 1790, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 3120, reasoningTokens: 2200 }, snap).totalNanoUsd);
    const glm = view.models.find((m) => m.modelId === "glm-5.3@max")!;
    expect(glm.costSource).toBe("provider_billed");
    expect(glm.costNanoUsd).toBe(13_163_000);
  });

  it("captured actual elapsed time", () => {
    const view = getRun(ctx, run1);
    const opus = view.models.find((m) => m.modelId === "claude-opus-5.5@max")!;
    const glm = view.models.find((m) => m.modelId === "glm-5.3@max")!;
    expect(opus.durationMs).toBeGreaterThanOrEqual(35);
    expect(glm.durationMs).toBeGreaterThanOrEqual(20);
    expect(view.run.durationMs).not.toBeNull();
  });

  it("persisted the exact output, reopenable later", () => {
    const view = getRun(ctx, run1, { fullOutput: true });
    const glm = view.models.find((m) => m.modelId === "glm-5.3@max")!;
    expect(glm.artifact!.content).toBe("## Matter type\nWorkers' compensation\n\n## Reply\nDear Jordan, thank you for contacting Morris Blackburn…");
    const reopened = getArtifact(ctx, glm.artifact!.id);
    expect(reopened.artifact.content).toBe(glm.artifact!.content);
    expect(listRuns(ctx).map((r) => r.id)).toContain(run1);
  });

  it("makes outputs comparable side by side", () => {
    const view = getRun(ctx, run1, { fullOutput: true });
    const outputs = view.models.filter((m) => m.artifact).map((m) => m.artifact!.content);
    expect(outputs).toHaveLength(2);
    expect(outputs[0]).not.toBe(outputs[1]);
  });

  it("keeps historical pricing unchanged after the catalogue changes", async () => {
    const before = getRun(ctx, run1).models.map((m) => [m.id, m.costNanoUsd, m.pricingSnapshotId]);
    await seedCatalogue({
      "anthropic/claude-opus-5.5": { pricing: { inputPerMTok: "40", outputPerMTok: "200", cacheReadPerMTok: null, cacheWritePerMTok: null } },
      "z-ai/glm-5.3": { pricing: { inputPerMTok: "9", outputPerMTok: "9", cacheReadPerMTok: null, cacheWritePerMTok: null } },
    });
    expect(getRun(ctx, run1).models.map((m) => [m.id, m.costNanoUsd, m.pricingSnapshotId])).toEqual(before);
  });

  it("ties the first run to v1 after a second version is created and run", async () => {
    const files = getTaskVersion(ctx, v1).files;
    const v2 = await updateTask(ctx, taskId, {
      name: "Review new client matter",
      departmentName: "Legal",
      workflowName: "New Client Intake",
      instructions: "Same as before, and finish with a triage priority: URGENT, STANDARD or DECLINE.",
      inputText: "New enquiry received via website form.",
      keepFileIds: files.map((f) => f.id),
      changeNote: "Added triage priority",
    });
    expect(v2.version).toBe(2);
    delete or.behaviors["openai/gpt-6-sol"];
    const { runId: run2 } = await createRun(ctx, { taskId, modelIds: MODELS, mode: "live" });
    await drainQueue();

    const r1 = getRun(ctx, run1);
    const r2 = getRun(ctx, run2);
    expect(r1.run.taskVersionId).toBe(v1);
    expect(r1.version.version).toBe(1);
    expect(r2.version.version).toBe(2);
    expect(r2.run.status).toBe("completed");
    expect(r2.run.payloadHash).not.toBe(r1.run.payloadHash);
    expect((await getRunInput(ctx, run1)).system).not.toContain("triage priority");
    expect((await getRunInput(ctx, run2)).system).toContain("triage priority");
  });
});
