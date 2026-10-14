/**
 * Executes ONE model for ONE run. Each run model is an independent job, so a
 * slow or failing model never blocks or erases the others.
 *
 * Measurement contract:
 *   TIME   = wall-clock of the provider call that produced the output (performance.now()).
 *   PRICE  = provider-billed amount when the provider reports one, otherwise
 *            usage × the pricing snapshot frozen on the run. Both are stored.
 *   OUTPUT = the exact text returned, stored verbatim as an artifact.
 */
import { and, eq } from "drizzle-orm";
import { getDb, type DB } from "../db/client";
import * as s from "../db/schema";
import { newId, sha256 } from "../ids";
import { log } from "../log";
import { calculateTaskCost, usdToNano } from "../pricing/cost";
import { getProvider } from "../providers/registry";
import { ProviderError, type ExecuteResult } from "../providers/types";
import { buildPayloadForVersion } from "../tasks/payload";
import { recordUsage } from "../billing/ledger";

const MAX_ATTEMPTS = 3;
const EXECUTION_TIMEOUT_MS = Number(process.env.EXECUTION_TIMEOUT_MS ?? 20 * 60 * 1000);
const CANCEL_POLL_MS = 1500;

export async function executeRunModel(runModelId: string, db: DB = getDb()): Promise<void> {
  const rm = db.select().from(s.runModels).where(eq(s.runModels.id, runModelId)).get();
  if (!rm || rm.status !== "queued") return;
  const run = db.select().from(s.runs).where(eq(s.runs.id, rm.runId)).get()!;

  if (run.cancelRequestedAt) {
    finish(db, rm.id, { status: "cancelled", errorCode: "cancelled", errorMessage: "Run was cancelled before this model started." });
    aggregateRunStatus(db, run.id);
    return;
  }

  const startedAt = Date.now();
  db.update(s.runModels).set({ status: "running", startedAt }).where(eq(s.runModels.id, rm.id)).run();
  db.update(s.runs).set({ status: "running", startedAt: run.startedAt ?? startedAt }).where(and(eq(s.runs.id, run.id), eq(s.runs.status, "queued"))).run();

  const provider = getProvider(rm.inferenceProvider);
  if (!provider || !provider.isConfigured()) {
    return fail(db, rm, run.id, "provider_not_configured", `Inference provider "${rm.inferenceProvider}" is not configured.`, 0);
  }
  if (provider.simulated !== (run.mode === "demo")) {
    return fail(db, rm, run.id, "mode_mismatch", "Refusing to mix simulated and live execution in one run.", 0);
  }

  let payload;
  try {
    const built = await buildPayloadForVersion(db, run.taskVersionId);
    if (built.hash !== run.payloadHash) {
      return fail(db, rm, run.id, "payload_mismatch", "The task payload no longer matches the one frozen for this run.", 0);
    }
    payload = built.payload;
  } catch (err) {
    return fail(db, rm, run.id, "payload_error", `Could not assemble the task inputs: ${(err as Error).message}`, 0);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXECUTION_TIMEOUT_MS);
  const cancelPoll = setInterval(() => {
    const r = db.select({ c: s.runs.cancelRequestedAt }).from(s.runs).where(eq(s.runs.id, run.id)).get();
    if (r?.c) controller.abort();
  }, CANCEL_POLL_MS);

  let attempts = 0;
  let result: ExecuteResult | null = null;
  let durationMs = 0;
  try {
    while (true) {
      attempts++;
      const t0 = performance.now();
      try {
        result = await provider.execute({
          payload,
          modelId: rm.modelId,
          providerModelId: rm.providerModelId,
          params: rm.requestParams,
          signal: controller.signal,
        });
        durationMs = Math.round(performance.now() - t0);
        break;
      } catch (err) {
        const pe = err instanceof ProviderError ? err : new ProviderError((err as Error).message ?? "Unknown error", "unknown", false);
        if (controller.signal.aborted) {
          const cancelled = Boolean(db.select({ c: s.runs.cancelRequestedAt }).from(s.runs).where(eq(s.runs.id, run.id)).get()?.c);
          if (cancelled) {
            finish(db, rm.id, { status: "cancelled", attempts, errorCode: "cancelled", errorMessage: "Run was cancelled while this model was executing." });
            aggregateRunStatus(db, run.id);
            return;
          }
          return fail(db, rm, run.id, "timeout", `No result within ${Math.round(EXECUTION_TIMEOUT_MS / 60000)} minutes.`, attempts);
        }
        if (pe.retryable && attempts < MAX_ATTEMPTS) {
          log.warn("provider call failed, retrying", { runModelId: rm.id, provider: rm.inferenceProvider, code: pe.code, attempts });
          await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempts - 1)));
          continue;
        }
        return fail(db, rm, run.id, pe.code, pe.message, attempts);
      }
    }
  } finally {
    clearTimeout(timeout);
    clearInterval(cancelPoll);
  }

  // ---- Cost ----------------------------------------------------------------
  const snapshot = rm.pricingSnapshotId
    ? db.select().from(s.modelPricingSnapshots).where(eq(s.modelPricingSnapshots.id, rm.pricingSnapshotId)).get()
    : undefined;
  if (!snapshot) return fail(db, rm, run.id, "pricing_missing", "The pricing snapshot for this run is missing.", attempts);

  let calculated;
  try {
    calculated = calculateTaskCost(result.usage, snapshot);
  } catch (err) {
    return fail(db, rm, run.id, "usage_invalid", `Provider returned unusable usage data: ${(err as Error).message}`, attempts);
  }
  const providerCostNano = result.providerCostUsd != null ? usdToNano(result.providerCostUsd) : null;
  const costSource = provider.simulated ? "simulated" : providerCostNano != null ? "provider_billed" : "calculated";
  const costNanoUsd = costSource === "provider_billed" ? providerCostNano! : calculated.totalNanoUsd;

  // ---- Persist result + artifact atomically ------------------------------------
  const completedAt = Date.now();
  const text = result.text;
  db.transaction((tx) => {
    tx.update(s.runModels)
      .set({
        status: "completed",
        completedAt,
        durationMs,
        timeToFirstTokenMs: result.timeToFirstTokenMs,
        attempts,
        inputTokens: result.usage.inputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
        outputTokens: result.usage.outputTokens,
        reasoningTokens: result.usage.reasoningTokens,
        costNanoUsd,
        costSource,
        calculatedCostNanoUsd: calculated.totalNanoUsd,
        providerCostNanoUsd: providerCostNano,
        costBreakdown: calculated.breakdown,
        currency: snapshot.currency,
        costCalculatedAt: completedAt,
        payloadHash: run.payloadHash,
        providerRequestId: result.providerRequestId,
        servedBy: result.servedBy,
        finishReason: result.finishReason,
        providerMeta: result.meta,
      })
      .where(eq(s.runModels.id, rm.id))
      .run();
    tx.insert(s.runArtifacts)
      .values({
        id: newId("art"),
        organizationId: rm.organizationId,
        runModelId: rm.id,
        artifactType: detectArtifactType(text),
        mimeType: "text/plain; charset=utf-8",
        content: text,
        sizeBytes: Buffer.byteLength(text, "utf8"),
        sha256: sha256(text),
        createdAt: completedAt,
      })
      .run();
  });
  if (!provider.simulated) recordUsage(db, rm.organizationId, rm.id, costNanoUsd, snapshot.currency);
  log.info("run model completed", { runModelId: rm.id, provider: rm.inferenceProvider, durationMs, costNanoUsd, costSource });
  aggregateRunStatus(db, run.id);
}

function fail(db: DB, rm: typeof s.runModels.$inferSelect, runId: string, code: string, message: string, attempts: number) {
  log.warn("run model failed", { runModelId: rm.id, provider: rm.inferenceProvider, code });
  finish(db, rm.id, { status: "failed", attempts, errorCode: code, errorMessage: message.slice(0, 2000) });
  aggregateRunStatus(db, runId);
}

function finish(db: DB, runModelId: string, patch: Partial<typeof s.runModels.$inferInsert>) {
  db.update(s.runModels).set({ completedAt: Date.now(), ...patch }).where(eq(s.runModels.id, runModelId)).run();
}

/** Mark a run model failed because its worker died mid-execution. */
export function failAbandoned(runModelId: string, db: DB = getDb()) {
  const rm = db.select().from(s.runModels).where(eq(s.runModels.id, runModelId)).get();
  if (!rm || (rm.status !== "running" && rm.status !== "queued")) return;
  fail(db, rm, rm.runId, "interrupted", "Execution was interrupted (worker stopped). No result was recorded; run the model again.", rm.attempts);
}

export function aggregateRunStatus(db: DB, runId: string) {
  const statuses = db.select({ status: s.runModels.status }).from(s.runModels).where(eq(s.runModels.runId, runId)).all().map((r) => r.status);
  const run = db.select().from(s.runs).where(eq(s.runs.id, runId)).get()!;
  if (statuses.some((x) => x === "queued" || x === "running")) {
    if (run.status === "queued" && statuses.some((x) => x !== "queued")) {
      db.update(s.runs).set({ status: "running", startedAt: run.startedAt ?? Date.now() }).where(eq(s.runs.id, runId)).run();
    }
    return;
  }
  const completed = statuses.filter((x) => x === "completed").length;
  const cancelled = statuses.filter((x) => x === "cancelled").length;
  const failed = statuses.filter((x) => x === "failed").length;
  const status: s.RunStatus =
    completed === statuses.length ? "completed" : completed > 0 ? "partial" : cancelled > 0 && failed === 0 ? "cancelled" : "failed";
  const completedAt = Date.now();
  db.update(s.runs)
    .set({ status, completedAt, durationMs: run.startedAt ? completedAt - run.startedAt : null })
    .where(eq(s.runs.id, runId))
    .run();
}

function detectArtifactType(text: string): "text" | "markdown" | "json" | "code" {
  const t = text.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  if (/^```[\w-]*\n[\s\S]*\n```$/.test(t)) return "code";
  if (/(^|\n)(#{1,6} |\* |- |\d+\. |> |\|.+\|)|\*\*[^*]+\*\*/.test(t)) return "markdown";
  return "text";
}
