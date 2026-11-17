import { db, membership } from "@nomeet/db";
import { auth } from "../../../auth";

export async function GET(request: Request) {
  const userId = (await auth())?.user?.id;
  if (!userId) return new Response(null, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspace") ?? "";
  async function unread() {
    return db.$transaction(async tx => {
      await membership(tx, workspaceId, userId!);
      return tx.notification.count({ where: { workspaceId, userId, readAt: null } });
    });
  }
  let count: number;
  try { count = await unread(); }
  catch { return new Response(null, { status: 404 }); }
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  let pending = false;
  let finish: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(finish);
  };
  return new Response(new ReadableStream({
    start(controller) {
      const send = (body: string) => controller.enqueue(encoder.encode(body));
      const close = () => {
        if (stopped) return;
        stop();
        request.signal.removeEventListener("abort", close);
        controller.close();
      };
      const sendCount = () => send(`event: unread\ndata: ${count}\n\n`);
      request.signal.addEventListener("abort", close, { once: true });
      if (request.signal.aborted) { close(); return; }
      sendCount();
      interval = setInterval(async () => {
        if (pending || stopped) return;
        pending = true;
        try {
          const next = await unread();
          if (stopped) return;
          if (count !== next) { count = next; sendCount(); }
          else send(": heartbeat\n\n");
        } catch {
          close();
        } finally { pending = false; }
      }, 10_000);
      finish = setTimeout(close, 60_000);
    },
    cancel() { stop(); },
  }), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
}
