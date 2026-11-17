import { db } from "@nomeet/db";
import { webEnv } from "../../../lib/env";

export async function GET() {
  const headers = { "cache-control": "no-store" };
  try {
    webEnv();
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
