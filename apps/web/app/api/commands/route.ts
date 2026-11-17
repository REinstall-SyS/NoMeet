import { trace, SpanStatusCode } from "@opentelemetry/api";
import { AppError, rateLimit, runCommand } from "@nomeet/db";
import { commandSchema, log } from "@nomeet/domain";
import { randomUUID } from "node:crypto";
import { auth } from "../../../auth";
import { webEnv } from "../../../lib/env";

export async function POST(request: Request) {
  const requestId = randomUUID();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  return trace.getTracer("nomeet.web").startActiveSpan("nomeet.command", async span => {
    let action: string | undefined;
    try {
      if (request.headers.get("origin") !== new URL(webEnv().APP_URL).origin) throw new AppError(403, "This request came from an unexpected origin.");
      const session = await auth();
      if (!session?.user?.id) throw new AppError(401, "Sign in to continue.");
      if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError(415, "Send JSON.");
      if (!request.body) throw new AppError(400, "The request was empty.");
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 65536) {
          await reader.cancel();
          throw new AppError(413, "This update is too large.");
        }
        chunks.push(value);
      }
      let json: unknown;
      try { json = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new AppError(400, "The request could not be read."); }
      const parsed = commandSchema.safeParse(json);
      if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? "Check the form values.");
      action = parsed.data.action;
      span.setAttribute("nomeet.action", action);
      const limit = action === "draft" ? [150, 5] : action === "invite" || action === "workspace" || action === "join" ? [15, 60] : [90, 5];
      if (!await rateLimit(`cmd:${session.user.id}:${action}`, limit[0], limit[1])) throw new AppError(429, "Too many requests. Try again later.");
      const data = await runCommand(session.user.id, parsed.data);
      log("info", "command.completed", { requestId, action });
      return Response.json({ data }, { headers });
    } catch (error) {
      const expected = error instanceof AppError;
      if (!expected) span.setStatus({ code: SpanStatusCode.ERROR });
      log(expected ? "warn" : "error", "command.failed", { requestId, action, status: expected ? error.status : 500, errorType: error instanceof Error ? error.constructor.name : "Unknown" });
      return Response.json({ error: { message: expected ? error.message : "Something went wrong. Try again.", requestId } }, { status: expected ? error.status : 500, headers });
    } finally {
      span.end();
    }
  });
}
