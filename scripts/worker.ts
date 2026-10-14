/** Standalone execution worker. Run alongside the web app with WORKER_INPROCESS=false. */
import "./env";
import { startWorker } from "../src/server/jobs/worker";

const worker = startWorker();
const shutdown = async () => {
  console.log("worker: finishing in-flight executions…");
  await worker.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
