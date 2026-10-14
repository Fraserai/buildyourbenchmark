/**
 * Durable job queue on the primary database. Claiming is a single atomic
 * UPDATE … RETURNING, so any number of worker processes can share the queue.
 * Running jobs are heart-beaten; a job whose worker disappears is detected by a
 * stale heartbeat and handed to the job type's `onAbandoned` handler (runs are
 * failed honestly — never silently re-executed and double-billed).
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb, type DB } from "../db/client";
import * as s from "../db/schema";
import { newId } from "../ids";

export type JobType = "execute_run_model" | "refresh_catalogue";
export type Job = typeof s.jobs.$inferSelect;

export const HEARTBEAT_STALE_MS = 90_000;

export function enqueue(type: JobType, payload: Record<string, unknown>, db: DB = getDb(), runAfter = Date.now()): string {
  const id = newId("job");
  const now = Date.now();
  db.insert(s.jobs).values({ id, type, payload, status: "queued", runAfter, createdAt: now, updatedAt: now }).run();
  return id;
}

export function claimNext(workerId: string, db: DB = getDb()): Job | null {
  const now = Date.now();
  const row = db.all<Record<string, unknown>>(sql`
    UPDATE jobs SET status = 'running', locked_by = ${workerId}, locked_at = ${now}, attempts = attempts + 1, updated_at = ${now}
    WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_after <= ${now} ORDER BY run_after, created_at LIMIT 1)
    RETURNING id`)[0];
  if (!row) return null;
  return db.select().from(s.jobs).where(eq(s.jobs.id, row.id as string)).get() ?? null;
}

export function heartbeat(jobIds: string[], workerId: string, db: DB = getDb()) {
  if (!jobIds.length) return;
  db.update(s.jobs)
    .set({ lockedAt: Date.now() })
    .where(and(inArray(s.jobs.id, jobIds), eq(s.jobs.lockedBy, workerId), eq(s.jobs.status, "running")))
    .run();
}

export function completeJob(id: string, db: DB = getDb()) {
  db.update(s.jobs).set({ status: "done", updatedAt: Date.now() }).where(eq(s.jobs.id, id)).run();
}

export function failJob(id: string, error: string, db: DB = getDb()) {
  db.update(s.jobs).set({ status: "failed", lastError: error.slice(0, 2000), updatedAt: Date.now() }).where(eq(s.jobs.id, id)).run();
}

/** Jobs whose worker stopped heart-beating. */
export function takeAbandoned(db: DB = getDb()): Job[] {
  const cutoff = Date.now() - HEARTBEAT_STALE_MS;
  const stale = db.select().from(s.jobs).where(and(eq(s.jobs.status, "running"), lt(s.jobs.lockedAt, cutoff))).all();
  for (const j of stale) failJob(j.id, "worker stopped responding", db);
  return stale;
}

export function hasPendingJob(type: JobType, db: DB = getDb()): boolean {
  return Boolean(
    db
      .select({ id: s.jobs.id })
      .from(s.jobs)
      .where(and(eq(s.jobs.type, type), inArray(s.jobs.status, ["queued", "running"])))
      .get(),
  );
}
