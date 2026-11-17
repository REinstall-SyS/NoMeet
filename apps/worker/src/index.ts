import { db } from "@nomeet/db";
import { log } from "@nomeet/domain";
import { workerConfig } from "./config";
import { startJobs } from "./jobs";

try {
  const config = workerConfig();
  await db.$queryRaw`SELECT 1`;
  const runtime = await startJobs(config);
  log("info", "worker.started", { queue: config.JOB_QUEUE });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await runtime.close();
    await db.$disconnect();
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  log("error", "worker.start_failed", { errorType: error instanceof Error ? error.constructor.name : "Unknown" });
  await db.$disconnect();
  process.exitCode = 1;
}
