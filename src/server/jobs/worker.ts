/**
 * Execution worker. Runs inside the web server process (WORKER_INPROCESS=true)
 * or as a separate process (`pnpm worker`). Many workers can share the queue.
 */
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import * as s from "../db/schema";
import { log } from "../log";
import { refreshCatalogue } from "../catalogue/refresh";
import { executeRunModel, failAbandoned } from "../runs/executor";
import { claimNext, completeJob, enqueue, failJob, hasPendingJob, heartbeat, takeAbandoned, type Job } from "./queue";

type WorkerHandle = { stop: () => Promise<void>; id: string };

const g = globalThis as unknown as { __workbenchWorker?: WorkerHandle };

async function handle(job: Job) {
  switch (job.type) {
    case "execute_run_model":
      await executeRunModel(String(job.payload.runModelId));
      return;
    case "refresh_catalogue":
      await refreshCatalogue({ trigger: String(job.payload.trigger ?? "scheduled") });
      return;
    default:
      throw new Error(`unknown job type ${job.type}`);
  }
}

function onAbandoned(job: Job) {
  if (job.type === "execute_run_model") failAbandoned(String(job.payload.runModelId));
}

function scheduleCatalogueRefresh() {
  const hours = Number(process.env.CATALOGUE_REFRESH_HOURS ?? 6);
  if (!(hours > 0)) return;
  const db = getDb();
  const last = db.select().from(s.catalogueRefreshes).where(eq(s.catalogueRefreshes.status, "completed")).orderBy(desc(s.catalogueRefreshes.startedAt)).limit(1).get();
  if ((!last || Date.now() - last.startedAt > hours * 3600_000) && !hasPendingJob("refresh_catalogue")) {
    enqueue("refresh_catalogue", { trigger: last ? "scheduled" : "initial" });
  }
}

export function startWorker(opts: { concurrency?: number; pollMs?: number } = {}): WorkerHandle {
  if (g.__workbenchWorker) return g.__workbenchWorker;
  const id = `wkr_${process.pid}_${crypto.randomBytes(3).toString("hex")}`;
  const concurrency = opts.concurrency ?? Number(process.env.WORKER_CONCURRENCY ?? 8);
  const pollMs = opts.pollMs ?? 400;
  const active = new Map<string, Promise<void>>();
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    try {
      while (active.size < concurrency) {
        const job = claimNext(id);
        if (!job) break;
        const p = handle(job)
          .then(() => completeJob(job.id))
          .catch((err) => {
            log.error("job failed", { jobId: job.id, type: job.type, error: (err as Error).message });
            failJob(job.id, (err as Error).message);
          })
          .finally(() => active.delete(job.id));
        active.set(job.id, p);
      }
    } catch (err) {
      log.error("worker tick error", { error: (err as Error).message });
    }
  };

  const loop = setInterval(tick, pollMs);
  const beat = setInterval(() => {
    try {
      heartbeat([...active.keys()], id);
      for (const job of takeAbandoned()) onAbandoned(job);
    } catch (err) {
      log.error("worker heartbeat error", { error: (err as Error).message });
    }
  }, 10_000);
  const sched = setInterval(() => {
    try {
      scheduleCatalogueRefresh();
    } catch (err) {
      log.error("catalogue schedule error", { error: (err as Error).message });
    }
  }, 60_000);
  for (const t of [loop, beat, sched]) t.unref?.();
  setTimeout(() => {
    try {
      scheduleCatalogueRefresh();
    } catch {
      /* database may not be ready yet */
    }
  }, 1000).unref?.();
  tick();
  log.info("worker started", { workerId: id, concurrency });

  const handleObj: WorkerHandle = {
    id,
    stop: async () => {
      stopped = true;
      clearInterval(loop);
      clearInterval(beat);
      clearInterval(sched);
      await Promise.allSettled([...active.values()]);
      g.__workbenchWorker = undefined;
    },
  };
  g.__workbenchWorker = handleObj;
  return handleObj;
}

/** Drain the queue synchronously-ish: used by tests and scripts. */
export async function drainQueue(maxJobs = 1000, workerId = "drain") {
  const running: Promise<void>[] = [];
  for (let i = 0; i < maxJobs; i++) {
    const job = claimNext(workerId);
    if (!job) break;
    running.push(
      handle(job)
        .then(() => completeJob(job.id))
        .catch((err) => failJob(job.id, (err as Error).message)),
    );
  }
  await Promise.all(running);
}
