export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKER_INPROCESS === "false") return;
  const { startWorker } = await import("./server/jobs/worker");
  startWorker();
}
