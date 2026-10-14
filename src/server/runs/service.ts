import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { newId } from "../ids";
import { audit } from "../audit";
import { NotFoundError, ValidationError, type Ctx } from "../auth/context";
import { chooseRoute } from "../providers/registry";
import { buildPayloadForVersion, describePayload } from "../tasks/payload";
import { enqueue } from "../jobs/queue";

export const MAX_MODELS_PER_RUN = 50;

/**
 * Create a run: freeze the task version, the payload hash, each model's version,
 * route and pricing snapshot, then enqueue one independent job per model.
 */
export async function createRun(
  ctx: Ctx,
  input: { taskId: string; taskVersionId?: string; modelIds: string[]; mode: "live" | "demo"; label?: string | null },
) {
  const db = getDb();
  const modelIds = [...new Set(input.modelIds)];
  if (modelIds.length === 0) throw new ValidationError("Select at least one model.");
  if (modelIds.length > MAX_MODELS_PER_RUN) throw new ValidationError(`Select at most ${MAX_MODELS_PER_RUN} models per run.`);

  const task = db
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.id, input.taskId), eq(s.tasks.organizationId, ctx.organizationId)))
    .get();
  if (!task) throw new NotFoundError("Task not found");
  const taskVersionId = input.taskVersionId ?? task.currentVersionId!;
  const version = db
    .select()
    .from(s.taskVersions)
    .where(and(eq(s.taskVersions.id, taskVersionId), eq(s.taskVersions.taskId, task.id), eq(s.taskVersions.organizationId, ctx.organizationId)))
    .get();
  if (!version) throw new NotFoundError("Task version not found");

  const models = db
    .select({ model: s.models, provider: s.providers })
    .from(s.models)
    .innerJoin(s.providers, eq(s.providers.id, s.models.providerId))
    .where(inArray(s.models.id, modelIds))
    .all();
  const routes = db.select().from(s.modelRoutes).where(inArray(s.modelRoutes.modelId, modelIds)).all();

  const plans = modelIds.map((id, position) => {
    const found = models.find((m) => m.model.id === id);
    if (!found) throw new ValidationError(`Unknown model: ${id}`);
    const { model, provider } = found;
    if (!model.currentPricingSnapshotId) throw new ValidationError(`${model.name} has no published pricing yet, so its cost could not be measured.`);
    if (!model.currentVersionId) throw new ValidationError(`${model.name} has no catalogue version.`);
    if (input.mode === "live" && model.status !== "available") throw new ValidationError(`${model.name} is not currently available.`);
    const route = chooseRoute(input.mode, model.id, routes.filter((r) => r.modelId === model.id), model.reasoningEffort);
    if (!route) throw new ValidationError(`No configured inference provider can run ${model.name}. Add a provider key or use demo mode.`);
    return { model, provider, route, position };
  });

  // Build once now: validates every input file and fixes the hash every execution must match.
  const { hash } = await buildPayloadForVersion(db, version.id);

  const now = Date.now();
  const runId = newId("run");
  db.transaction((tx) => {
    tx.insert(s.runs)
      .values({
        id: runId,
        organizationId: ctx.organizationId,
        taskId: task.id,
        taskVersionId: version.id,
        mode: input.mode,
        status: "queued",
        payloadHash: hash,
        label: input.label?.trim() || null,
        createdBy: ctx.userId,
        createdAt: now,
      })
      .run();
    for (const p of plans) {
      const runModelId = newId("rm");
      tx.insert(s.runModels)
        .values({
          id: runModelId,
          organizationId: ctx.organizationId,
          runId,
          position: p.position,
          modelId: p.model.id,
          modelVersionId: p.model.currentVersionId!,
          modelName: p.model.name,
          modelVariant: p.model.variant,
          providerName: p.provider.name,
          providerColor: p.provider.color,
          inferenceProvider: p.route.inferenceProvider,
          providerModelId: p.route.providerModelId,
          requestParams: { ...p.route.params, maxOutputTokens: version.maxOutputTokens },
          status: "queued",
          queuedAt: now,
          pricingSnapshotId: p.model.currentPricingSnapshotId,
        })
        .run();
      enqueue("execute_run_model", { runModelId }, tx as unknown as ReturnType<typeof getDb>);
    }
  });
  audit(ctx, "run.created", { type: "run", id: runId }, { mode: input.mode, models: modelIds.length, taskVersion: version.version });
  return { runId };
}

export function requestCancel(ctx: Ctx, runId: string) {
  const db = getDb();
  const run = getRunRow(ctx, runId);
  if (["completed", "failed", "partial", "cancelled"].includes(run.status)) return;
  db.update(s.runs).set({ cancelRequestedAt: Date.now() }).where(eq(s.runs.id, runId)).run();
  audit(ctx, "run.cancel_requested", { type: "run", id: runId });
}

function getRunRow(ctx: Ctx, runId: string) {
  const run = getDb()
    .select()
    .from(s.runs)
    .where(and(eq(s.runs.id, runId), eq(s.runs.organizationId, ctx.organizationId)))
    .get();
  if (!run) throw new NotFoundError("Run not found");
  return run;
}

export function updateRunNotes(ctx: Ctx, runId: string, patch: { label?: string | null; notes?: string | null }) {
  getRunRow(ctx, runId);
  getDb()
    .update(s.runs)
    .set({ label: patch.label?.trim() || null, notes: patch.notes?.trim() || null })
    .where(and(eq(s.runs.id, runId), eq(s.runs.organizationId, ctx.organizationId)))
    .run();
}

const PREVIEW_CHARS = 1400;

/** Full run record for the results page / polling endpoint. Output previews only; full artifacts are fetched separately. */
export function getRun(ctx: Ctx, runId: string, opts: { fullOutput?: boolean } = {}) {
  const db = getDb();
  const run = getRunRow(ctx, runId);
  const task = db.select().from(s.tasks).where(eq(s.tasks.id, run.taskId)).get()!;
  const version = db.select().from(s.taskVersions).where(eq(s.taskVersions.id, run.taskVersionId)).get()!;
  const creator = db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, run.createdBy)).get();
  const rms = db
    .select()
    .from(s.runModels)
    .where(and(eq(s.runModels.runId, runId), eq(s.runModels.organizationId, ctx.organizationId)))
    .orderBy(asc(s.runModels.position))
    .all();
  const artifacts = rms.length
    ? db
        .select()
        .from(s.runArtifacts)
        .where(and(inArray(s.runArtifacts.runModelId, rms.map((r) => r.id)), eq(s.runArtifacts.organizationId, ctx.organizationId)))
        .all()
    : [];
  const snapshots = rms.length
    ? db
        .select()
        .from(s.modelPricingSnapshots)
        .where(inArray(s.modelPricingSnapshots.id, rms.map((r) => r.pricingSnapshotId).filter((x): x is string => Boolean(x))))
        .all()
    : [];

  return {
    run,
    task: { id: task.id, name: task.name, currentVersionId: task.currentVersionId },
    version: { id: version.id, version: version.version, createdAt: version.createdAt },
    createdByName: creator?.name ?? "Unknown",
    models: rms.map((rm) => {
      const artifact = artifacts.find((a) => a.runModelId === rm.id) ?? null;
      const snap = snapshots.find((p) => p.id === rm.pricingSnapshotId) ?? null;
      return {
        ...rm,
        pricingSnapshot: snap ? { id: snap.id, inputPerMTok: snap.inputPerMTok, outputPerMTok: snap.outputPerMTok, source: snap.source, capturedAt: snap.capturedAt } : null,
        artifact: artifact
          ? {
              id: artifact.id,
              artifactType: artifact.artifactType,
              sizeBytes: artifact.sizeBytes,
              sha256: artifact.sha256,
              content: opts.fullOutput ? artifact.content ?? "" : undefined,
              preview: (artifact.content ?? "").slice(0, PREVIEW_CHARS),
              truncated: (artifact.content ?? "").length > PREVIEW_CHARS,
            }
          : null,
      };
    }),
  };
}

export type RunView = ReturnType<typeof getRun>;

export async function getRunInput(ctx: Ctx, runId: string) {
  const run = getRunRow(ctx, runId);
  const { payload, hash } = await buildPayloadForVersion(getDb(), run.taskVersionId);
  return { ...describePayload(payload), hash, matches: hash === run.payloadHash, maxOutputTokens: payload.maxOutputTokens };
}

export function getArtifact(ctx: Ctx, artifactId: string) {
  const db = getDb();
  const row = db
    .select({ artifact: s.runArtifacts, runModel: s.runModels })
    .from(s.runArtifacts)
    .innerJoin(s.runModels, eq(s.runModels.id, s.runArtifacts.runModelId))
    .where(and(eq(s.runArtifacts.id, artifactId), eq(s.runArtifacts.organizationId, ctx.organizationId)))
    .get();
  if (!row) throw new NotFoundError("Output not found");
  return row;
}

export function listRuns(ctx: Ctx, opts: { taskId?: string; limit?: number; mode?: "live" | "demo" } = {}) {
  const db = getDb();
  const conds = [eq(s.runs.organizationId, ctx.organizationId)];
  if (opts.taskId) conds.push(eq(s.runs.taskId, opts.taskId));
  if (opts.mode) conds.push(eq(s.runs.mode, opts.mode));
  const runs = db
    .select({
      id: s.runs.id,
      status: s.runs.status,
      mode: s.runs.mode,
      label: s.runs.label,
      createdAt: s.runs.createdAt,
      durationMs: s.runs.durationMs,
      taskId: s.runs.taskId,
      taskName: s.tasks.name,
      taskVersion: s.taskVersions.version,
      departmentName: s.departments.name,
      createdByName: s.users.name,
    })
    .from(s.runs)
    .innerJoin(s.tasks, eq(s.tasks.id, s.runs.taskId))
    .innerJoin(s.taskVersions, eq(s.taskVersions.id, s.runs.taskVersionId))
    .innerJoin(s.users, eq(s.users.id, s.runs.createdBy))
    .leftJoin(s.departments, eq(s.departments.id, s.tasks.departmentId))
    .where(and(...conds))
    .orderBy(desc(s.runs.createdAt))
    .limit(opts.limit ?? 200)
    .all();
  const ids = runs.map((r) => r.id);
  const rms = ids.length
    ? db
        .select({
          runId: s.runModels.runId,
          modelName: s.runModels.modelName,
          providerColor: s.runModels.providerColor,
          status: s.runModels.status,
          costNanoUsd: s.runModels.costNanoUsd,
          durationMs: s.runModels.durationMs,
        })
        .from(s.runModels)
        .where(and(eq(s.runModels.organizationId, ctx.organizationId), inArray(s.runModels.runId, ids)))
        .orderBy(asc(s.runModels.position))
        .all()
    : [];
  return runs.map((r) => {
    const models = rms.filter((m) => m.runId === r.id);
    const done = models.filter((m) => m.status === "completed");
    return {
      ...r,
      models,
      totalCostNanoUsd: done.reduce((n, m) => n + (m.costNanoUsd ?? 0), 0),
      completedCount: done.length,
    };
  });
}

export function usageSummary(ctx: Ctx) {
  const db = getDb();
  return db
    .select({
      mode: s.runs.mode,
      executions: sql<number>`count(*)`,
      costNanoUsd: sql<number>`coalesce(sum(${s.runModels.costNanoUsd}), 0)`,
    })
    .from(s.runModels)
    .innerJoin(s.runs, eq(s.runs.id, s.runModels.runId))
    .where(and(eq(s.runModels.organizationId, ctx.organizationId), eq(s.runModels.status, "completed")))
    .groupBy(s.runs.mode)
    .all();
}
