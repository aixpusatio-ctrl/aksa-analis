import type { ScraperEvent } from "@shared/types.ts";
import { eventBus } from "../utils/event-bus.ts";

/** Comment frames keep proxies from closing an idle SSE connection. */
const HEARTBEAT_MS = 25_000;

/**
 * Open a Server-Sent Events stream. When `runId` is given only events for that
 * run are forwarded, which is what the run detail page subscribes to.
 */
export function openEventStream(request: Request, runId: string | null = null): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const sendEvent = (event: ScraperEvent) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = eventBus.subscribe(sendEvent, runId);
      const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }

      // `retry` tells EventSource how long to wait before reconnecting.
      send(`retry: 2000\n\n`);
      send(`event: ready\ndata: ${JSON.stringify({ runId })}\n\n`);

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
