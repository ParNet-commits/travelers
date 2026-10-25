/**
 * POST + streamed SSE (EventSource cannot POST). Every event is Zod-validated before the UI sees it.
 * Stall watchdog: no bytes (events or ": ping" heartbeats) for 25 s -> abort with kind "stalled".
 */
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { SSEEvent, type PlanRequestBody } from "../../types/travelverse.js";

export type StreamErrorKind = "http" | "network" | "protocol" | "stalled";

export class StreamError extends Error {
  readonly kind: StreamErrorKind;
  readonly status: number | null;
  readonly code: string;

  constructor(kind: StreamErrorKind, message: string, status: number | null = null, code = "STREAM_ERROR") {
    super(message);
    this.name = "StreamError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export interface StreamHandlers {
  onEvent: (ev: SSEEvent) => void;
  onInvalid?: (raw: string) => void;
}

export interface StreamOptions {
  signal: AbortSignal;
  adminToken?: string;
  stallMs?: number;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function readErrorBody(data: unknown): { code: string; message: string } {
  if (typeof data === "object" && data !== null) {
    const rec = data as Record<string, unknown>;
    const code = typeof rec.code === "string" ? rec.code : "HTTP_ERROR";
    const message = typeof rec.message === "string" ? rec.message : "Request failed";
    return { code, message };
  }
  return { code: "HTTP_ERROR", message: "Request failed" };
}

export async function streamPlan(body: PlanRequestBody, h: StreamHandlers, o: StreamOptions): Promise<void> {
  const f = o.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "content-type": "application/json", accept: "text/event-stream" };
  if (o.adminToken) headers["x-tv-admin"] = o.adminToken;

  let res: Response;
  try {
    res = await f(o.endpoint ?? "/api/plan", { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
  } catch {
    throw new StreamError("network", "Could not reach the server");
  }
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const e = readErrorBody(data);
    throw new StreamError("http", e.message, res.status, e.code);
  }
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
    throw new StreamError("protocol", "Server did not return an event stream", res.status);
  }

  const parser = createParser({
    maxBufferSize: 4_000_000,
    onEvent: (msg: EventSourceMessage) => {
      let data: unknown;
      try {
        data = JSON.parse(msg.data);
      } catch {
        h.onInvalid?.(msg.data);
        return;
      }
      const parsed = SSEEvent.safeParse(data);
      if (parsed.success) h.onEvent(parsed.data);
      else h.onInvalid?.(msg.data.slice(0, 300));
    },
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const stallMs = o.stallMs ?? 25_000;
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      void reader.cancel().catch(() => undefined);
    }, stallMs);
  };
  arm();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
  } catch {
    if (!o.signal.aborted && !stalled) throw new StreamError("network", "Connection lost");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (stalled) throw new StreamError("stalled", `No data for ${Math.round(stallMs / 1000)} s`);
}
