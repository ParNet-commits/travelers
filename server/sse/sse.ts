/**
 * SSE transport for Vercel Node functions (Web Response + ReadableStream).
 * - every event is validated against the SSEEvent schema before it is written (invalid -> error event, never bad data)
 * - monotonically increasing seq, t = ms since run start, runId on every event
 * - ": ping" heartbeat every 5 s keeps proxies from buffering or closing the stream
 * - client disconnect (request.signal, needs supportsCancellation in vercel.json) aborts the run
 * - guarantees exactly one terminal "done" event
 */
import { randomUUID } from "node:crypto";
import { SSEEvent } from "../../types/travelverse.js";
import type { Emit } from "../agents/common.js";
import { log } from "../telemetry.js";

export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export function newRunId(): string {
  return `run_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/** JSON.stringify never emits raw newlines, so one data: line per event is always safe. */
export function encodeEvent(ev: SSEEvent): string {
  return `id: ${ev.seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
}

export interface SseOptions {
  runId: string;
  signal: AbortSignal;
  heartbeatMs?: number;
  now?: () => number;
  run: (emit: Emit, signal: AbortSignal) => Promise<void>;
}

export function createSseResponse(o: SseOptions): Response {
  const encoder = new TextEncoder();
  const now = o.now ?? Date.now;
  const started = now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (o.signal.aborted) controller.abort();
  else o.signal.addEventListener("abort", onAbort, { once: true });

  let seq = 0;
  let closed = false;
  let doneSent = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      const write = (s: string) => {
        if (closed) return;
        try {
          c.enqueue(encoder.encode(s));
        } catch {
          closed = true;
          controller.abort();
        }
      };
      const emit: Emit = (input) => {
        if (closed || doneSent) return;
        const t = Math.max(0, Math.round(now() - started));
        const parsed = SSEEvent.safeParse({ ...input, seq, t, runId: o.runId });
        let ev: SSEEvent;
        if (parsed.success) {
          ev = parsed.data;
        } else {
          const issue = parsed.error.issues[0];
          const path = issue?.path.map(String).join(".") ?? "?";
          log("error", "sse_event_invalid", { runId: o.runId, type: input.type, path, message: issue?.message ?? "" });
          ev = { type: "error", code: "EVENT_SCHEMA", message: `Internal: dropped an invalid ${input.type} event (${path})`.slice(0, 300), recoverable: true, seq, t, runId: o.runId };
        }
        seq += 1;
        if (ev.type === "done") doneSent = true;
        write(encodeEvent(ev));
      };

      write(": open\n\n");
      heartbeat = setInterval(() => write(": ping\n\n"), o.heartbeatMs ?? 5_000);

      void o
        .run(emit, controller.signal)
        .catch((err: unknown) => {
          log("error", "sse_run_crashed", { runId: o.runId, message: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
          emit({ type: "error", code: "INTERNAL", message: "Unexpected server error", recoverable: false });
        })
        .finally(() => {
          if (!doneSent) emit({ type: "done", status: controller.signal.aborted ? "cancelled" : "failed" });
          if (heartbeat) clearInterval(heartbeat);
          closed = true;
          o.signal.removeEventListener("abort", onAbort);
          try {
            c.close();
          } catch {
            /* stream already closed by the client */
          }
        });
    },
    cancel() {
      closed = true;
      controller.abort();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}
