import { Queue } from "bullmq";
import { db } from "@nomeet/db";
import { workerConfig } from "./config";
import { connection } from "./jobs";

const config = workerConfig();
const redis = connection(config);
const queue = new Queue(config.JOB_QUEUE, { connection: redis });
try {
  const [counts, failed, mail] = await Promise.all([
    queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"),
    queue.getFailed(0, 14),
    db.notification.groupBy({ by: ["mailState"], _count: true }),
  ]);
  console.log(JSON.stringify({ queue: config.JOB_QUEUE, counts, failures: failed.map(job => ({ id: job.id, name: job.name, attempts: job.attemptsMade })), mail }, null, 2));
} finally { await queue.close(); redis.disconnect(); await db.$disconnect(); }
