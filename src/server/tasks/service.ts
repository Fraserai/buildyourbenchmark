import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { canonicalJson, newId, sha256 } from "../ids";
import { audit } from "../audit";
import { NotFoundError, ValidationError, type Ctx } from "../auth/context";
import { objectStore } from "../storage/files";
import type { ProcessedFile } from "./files";
import { ensureDepartment, ensureWorkflow } from "../orgs/service";

export const DEFAULT_MAX_OUTPUT_TOKENS = 32000;

export type TaskFileInput = ProcessedFile & { role: "input" | "reference" };

export type TaskDefinitionInput = {
  name: string;
  description?: string | null;
  departmentName?: string | null;
  workflowName?: string | null;
  tags?: string[];
  instructions: string;
  inputText?: string;
  maxOutputTokens?: number;
};

function validateDefinition(input: TaskDefinitionInput) {
  if (!input.name.trim()) throw new ValidationError("Give the task a name.");
  if (input.name.length > 200) throw new ValidationError("Task name is too long.");
  if (!input.instructions.trim()) throw new ValidationError("Write the instructions for this piece of work.");
  const max = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  if (!Number.isInteger(max) || max < 256 || max > 128000) throw new ValidationError("Max output tokens must be between 256 and 128,000.");
}

type FileRecord = { role: string; filename: string; sha256: string; position: number };

function versionHash(instructions: string, inputText: string, maxOutputTokens: number, files: FileRecord[]) {
  return sha256(canonicalJson({ instructions, inputText, maxOutputTokens, files: files.map((f) => ({ role: f.role, filename: f.filename, sha256: f.sha256, position: f.position })) }));
}

/** Store new file bytes (encrypted) and return rows ready for insertion. */
async function persistNewFiles(ctx: Ctx, files: TaskFileInput[]) {
  const stored = [];
  for (const f of files) {
    const storageKey = await objectStore.put(ctx.organizationId, f.bytes);
    stored.push({ ...f, storageKey });
  }
  return stored;
}

function resolveHierarchy(ctx: Ctx, input: TaskDefinitionInput) {
  const departmentId = input.departmentName?.trim() ? ensureDepartment(ctx, input.departmentName.trim()) : null;
  const workflowId = input.workflowName?.trim() ? ensureWorkflow(ctx, input.workflowName.trim(), departmentId) : null;
  return { departmentId, workflowId };
}

export async function createTask(ctx: Ctx, input: TaskDefinitionInput, files: TaskFileInput[] = []) {
  validateDefinition(input);
  const db = getDb();
  const now = Date.now();
  const taskId = newId("task");
  const versionId = newId("tv");
  const { departmentId, workflowId } = resolveHierarchy(ctx, input);
  const stored = await persistNewFiles(ctx, files);
  const maxOutputTokens = input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const fileRecords = stored.map((f, position) => ({ ...f, position }));

  db.transaction((tx) => {
    tx.insert(s.tasks)
      .values({
        id: taskId,
        organizationId: ctx.organizationId,
        departmentId,
        workflowId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        tags: normalizeTags(input.tags),
        currentVersionId: versionId,
        createdBy: ctx.userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(s.taskVersions)
      .values({
        id: versionId,
        organizationId: ctx.organizationId,
        taskId,
        version: 1,
        instructions: input.instructions,
        inputText: input.inputText ?? "",
        maxOutputTokens,
        contentHash: versionHash(input.instructions, input.inputText ?? "", maxOutputTokens, fileRecords),
        createdBy: ctx.userId,
        createdAt: now,
      })
      .run();
    for (const f of fileRecords) insertFile(tx, ctx, versionId, f, now);
  });
  audit(ctx, "task.created", { type: "task", id: taskId }, { version: 1, files: files.length });
  return { taskId, versionId };
}

function insertFile(
  tx: Pick<ReturnType<typeof getDb>, "insert">,
  ctx: Ctx,
  taskVersionId: string,
  f: { role: "input" | "reference"; position: number; filename: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; kind: "text" | "image"; extractedText: string | null; extractionMethod: string },
  now: number,
) {
  tx.insert(s.taskFiles)
    .values({
      id: newId("file"),
      organizationId: ctx.organizationId,
      taskVersionId,
      role: f.role,
      position: f.position,
      filename: f.filename,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256,
      storageKey: f.storageKey,
      kind: f.kind,
      extractedText: f.extractedText,
      extractionMethod: f.extractionMethod,
      createdAt: now,
    })
    .run();
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

/**
 * Update a task. Metadata (name, department, tags) changes in place. Any change to
 * what models receive (instructions, input, files, output limit) creates a new
 * immutable version; runs keep pointing at the version they executed.
 */
export async function updateTask(
  ctx: Ctx,
  taskId: string,
  input: TaskDefinitionInput & { keepFileIds: string[]; keepFileRoles?: Record<string, "input" | "reference">; changeNote?: string | null },
  newFiles: TaskFileInput[] = [],
) {
  validateDefinition(input);
  const db = getDb();
  const task = getTaskRow(ctx, taskId);
  const current = db.select().from(s.taskVersions).where(eq(s.taskVersions.id, task.currentVersionId!)).get()!;
  const currentFiles = db.select().from(s.taskFiles).where(eq(s.taskFiles.taskVersionId, current.id)).orderBy(asc(s.taskFiles.position)).all();
  const kept = currentFiles
    .filter((f) => input.keepFileIds.includes(f.id))
    .map((f) => ({ ...f, role: input.keepFileRoles?.[f.id] ?? f.role }));
  const stored = await persistNewFiles(ctx, newFiles);
  const nextFiles = [...kept, ...stored].map((f, position) => ({ ...f, position }));
  const maxOutputTokens = input.maxOutputTokens ?? current.maxOutputTokens;
  const hash = versionHash(input.instructions, input.inputText ?? "", maxOutputTokens, nextFiles);
  const now = Date.now();
  const { departmentId, workflowId } = resolveHierarchy(ctx, input);

  let versionId = current.id;
  let version = current.version;
  db.transaction((tx) => {
    if (hash !== current.contentHash) {
      versionId = newId("tv");
      version = current.version + 1;
      tx.insert(s.taskVersions)
        .values({
          id: versionId,
          organizationId: ctx.organizationId,
          taskId,
          version,
          instructions: input.instructions,
          inputText: input.inputText ?? "",
          maxOutputTokens,
          contentHash: hash,
          changeNote: input.changeNote?.trim() || null,
          createdBy: ctx.userId,
          createdAt: now,
        })
        .run();
      for (const f of nextFiles) insertFile(tx, ctx, versionId, f, now);
    }
    tx.update(s.tasks)
      .set({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        departmentId,
        workflowId,
        tags: normalizeTags(input.tags),
        currentVersionId: versionId,
        updatedAt: now,
      })
      .where(and(eq(s.tasks.id, taskId), eq(s.tasks.organizationId, ctx.organizationId)))
      .run();
  });
  if (versionId !== current.id) audit(ctx, "task.versioned", { type: "task", id: taskId }, { version });
  return { taskId, versionId, version, newVersion: versionId !== current.id };
}

export function setTaskStatus(ctx: Ctx, taskId: string, status: "active" | "archived") {
  getTaskRow(ctx, taskId);
  getDb()
    .update(s.tasks)
    .set({ status, updatedAt: Date.now() })
    .where(and(eq(s.tasks.id, taskId), eq(s.tasks.organizationId, ctx.organizationId)))
    .run();
  audit(ctx, `task.${status}`, { type: "task", id: taskId });
}

function getTaskRow(ctx: Ctx, taskId: string) {
  const task = getDb()
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.id, taskId), eq(s.tasks.organizationId, ctx.organizationId)))
    .get();
  if (!task) throw new NotFoundError("Task not found");
  return task;
}

export function getTask(ctx: Ctx, taskId: string) {
  const db = getDb();
  const task = getTaskRow(ctx, taskId);
  const versions = db
    .select({
      id: s.taskVersions.id,
      version: s.taskVersions.version,
      createdAt: s.taskVersions.createdAt,
      changeNote: s.taskVersions.changeNote,
      createdByName: s.users.name,
    })
    .from(s.taskVersions)
    .innerJoin(s.users, eq(s.users.id, s.taskVersions.createdBy))
    .where(and(eq(s.taskVersions.taskId, taskId), eq(s.taskVersions.organizationId, ctx.organizationId)))
    .orderBy(desc(s.taskVersions.version))
    .all();
  const department = task.departmentId ? db.select().from(s.departments).where(eq(s.departments.id, task.departmentId)).get() : null;
  const workflow = task.workflowId ? db.select().from(s.workflows).where(eq(s.workflows.id, task.workflowId)).get() : null;
  const creator = db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, task.createdBy)).get();
  return { task, versions, department, workflow, createdByName: creator?.name ?? "Unknown" };
}

export function getTaskVersion(ctx: Ctx, versionId: string) {
  const db = getDb();
  const version = db
    .select()
    .from(s.taskVersions)
    .where(and(eq(s.taskVersions.id, versionId), eq(s.taskVersions.organizationId, ctx.organizationId)))
    .get();
  if (!version) throw new NotFoundError("Task version not found");
  const files = db
    .select()
    .from(s.taskFiles)
    .where(and(eq(s.taskFiles.taskVersionId, versionId), eq(s.taskFiles.organizationId, ctx.organizationId)))
    .orderBy(asc(s.taskFiles.position))
    .all();
  return { version, files };
}

export function getTaskFile(ctx: Ctx, fileId: string) {
  const file = getDb()
    .select()
    .from(s.taskFiles)
    .where(and(eq(s.taskFiles.id, fileId), eq(s.taskFiles.organizationId, ctx.organizationId)))
    .get();
  if (!file) throw new NotFoundError("File not found");
  return file;
}

export function listTasks(ctx: Ctx, opts: { q?: string; departmentId?: string; status?: "active" | "archived" | "all" } = {}) {
  const db = getDb();
  const conds = [eq(s.tasks.organizationId, ctx.organizationId)];
  if (opts.status !== "all") conds.push(eq(s.tasks.status, opts.status ?? "active"));
  if (opts.departmentId) conds.push(eq(s.tasks.departmentId, opts.departmentId));
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conds.push(or(like(s.tasks.name, q), like(s.tasks.description, q))!);
  }
  const rows = db
    .select({
      id: s.tasks.id,
      name: s.tasks.name,
      description: s.tasks.description,
      status: s.tasks.status,
      tags: s.tasks.tags,
      updatedAt: s.tasks.updatedAt,
      departmentId: s.tasks.departmentId,
      departmentName: s.departments.name,
      workflowName: s.workflows.name,
      version: s.taskVersions.version,
    })
    .from(s.tasks)
    .leftJoin(s.departments, eq(s.departments.id, s.tasks.departmentId))
    .leftJoin(s.workflows, eq(s.workflows.id, s.tasks.workflowId))
    .leftJoin(s.taskVersions, eq(s.taskVersions.id, s.tasks.currentVersionId))
    .where(and(...conds))
    .orderBy(desc(s.tasks.updatedAt))
    .limit(500)
    .all();

  const ids = rows.map((r) => r.id);
  const runStats = ids.length
    ? db
        .select({ taskId: s.runs.taskId, runs: sql<number>`count(*)`, lastRunAt: sql<number>`max(${s.runs.createdAt})` })
        .from(s.runs)
        .where(and(eq(s.runs.organizationId, ctx.organizationId), inArray(s.runs.taskId, ids)))
        .groupBy(s.runs.taskId)
        .all()
    : [];
  const statsBy = new Map(runStats.map((r) => [r.taskId, r]));
  return rows.map((r) => ({ ...r, runs: statsBy.get(r.id)?.runs ?? 0, lastRunAt: statsBy.get(r.id)?.lastRunAt ?? null }));
}
