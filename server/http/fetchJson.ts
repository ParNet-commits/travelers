/**
 * The only way server code calls a non-LLM HTTP API.
 * Timeout (+ run cancellation), one retry with jitter, per-host circuit breaker, TTL LRU cache, Zod validation,
 * size cap and typed AppErrors. Never throws anything but AppError.
 */
import type { z } from "zod";
import { AppError, type ErrorCode } from "../errors.js";

/* ---------- TTL LRU cache ---------- */
class TtlLru {
  private readonly map = new Map<string, { exp: number; value: unknown }>();
  private readonly max: number;
  hits = 0;
  misses = 0;
  constructor(max: number) {
    this.max = max;
  }
  get(key: string, now: number): unknown {
    const e = this.map.get(key);
    if (!e || e.exp < now) {
      if (e) this.map.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, e);
    this.hits += 1;
    return e.value;
  }
  set(key: string, value: unknown, ttlMs: number, now: number): void {
    this.map.delete(key);
    this.map.set(key, { exp: now + ttlMs, value });
    while (this.map.size > this.max) {
      const first = this.map.keys().next();
      if (first.done) break;
      this.map.delete(first.value);
    }
  }
  size(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
const cache = new TtlLru(500);

/* ---------- circuit breaker ---------- */
interface Breaker {
  failures: number;
  openUntil: number;
  halfOpen: boolean;
}
const breakers = new Map<string, Breaker>();
const FAILS_TO_OPEN = 3;
const OPEN_MS = 60_000;

function breakerAllows(key: string, now: number): boolean {
  const b = breakers.get(key);
  if (!b || b.openUntil === 0) return true;
  if (now >= b.openUntil) {
    b.halfOpen = true;
    return true;
  }
  return false;
}
function breakerSuccess(key: string): void {
  breakers.set(key, { failures: 0, openUntil: 0, halfOpen: false });
}
function breakerFailure(key: string, now: number): void {
  const b = breakers.get(key) ?? { failures: 0, openUntil: 0, halfOpen: false };
  b.failures += 1;
  if (b.halfOpen || b.failures >= FAILS_TO_OPEN) {
    b.openUntil = now + OPEN_MS;
    b.halfOpen = false;
  }
  breakers.set(key, b);
}
/** Open a breaker immediately (quota/auth errors): no point hammering a provider that said no. */
export function tripBreaker(key: string, ms: number, now = Date.now()): void {
  breakers.set(key, { failures: FAILS_TO_OPEN, openUntil: now + ms, halfOpen: false });
}

export function httpStats(now = Date.now()) {
  return {
    breakers: [...breakers.entries()].map(([host, b]) => ({
      host,
      state: b.openUntil === 0 ? ("closed" as const) : now < b.openUntil ? ("open" as const) : ("half_open" as const),
      failures: b.failures,
    })),
    cache: { entries: cache.size(), hits: cache.hits, misses: cache.misses },
  };
}

/** Tests only. */
export function resetHttpState(): void {
  breakers.clear();
  cache.clear();
}

/* ---------- fetchJson ---------- */
export interface FetchJsonOptions<T> {
  label: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  schema: z.ZodType<T>;
  timeoutMs: number;
  signal?: AbortSignal;
  retries?: 0 | 1;
  cacheKey?: string;
  cacheTtlMs?: number;
  breakerKey?: string;
  maxChars?: number;
  /** status -> error code overrides, e.g. { 432: "TOOL_QUOTA" } */
  statusCodes?: Partial<Record<number, ErrorCode>>;
  fetchImpl?: typeof fetch;
}

export interface FetchJsonResult<T> {
  data: T;
  cached: boolean;
  ms: number;
  attempts: number;
}

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["TOOL_RATE_LIMIT", "TOOL_UPSTREAM", "TOOL_TIMEOUT", "TOOL_NETWORK"]);

function classifyStatus(status: number, overrides: Partial<Record<number, ErrorCode>> | undefined): ErrorCode {
  const o = overrides?.[status];
  if (o) return o;
  if (status === 401 || status === 403) return "TOOL_AUTH";
  if (status === 429) return "TOOL_RATE_LIMIT";
  if (status === 402 || status === 432 || status === 433) return "TOOL_QUOTA";
  if (status >= 500) return "TOOL_UPSTREAM";
  return "TOOL_BAD_RESPONSE";
}

export function hostKey(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-host";
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError("ABORTED", "aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AppError("ABORTED", "aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function backoffMs(retryAfterHeader: string | null): number {
  const s = Number(retryAfterHeader);
  if (Number.isFinite(s) && s > 0 && s <= 3) return s * 1000;
  return 300 + Math.floor(Math.random() * 600);
}

type RawResult = { ok: true; status: number; text: string; retryAfter: string | null } | { ok: false; error: AppError };

async function rawFetch<T>(o: FetchJsonOptions<T>): Promise<RawResult> {
  const timeout = AbortSignal.timeout(o.timeoutMs);
  const signal = o.signal ? AbortSignal.any([timeout, o.signal]) : timeout;
  const f = o.fetchImpl ?? fetch;
  try {
    const init: RequestInit = { method: o.method ?? "GET", signal };
    if (o.headers) init.headers = o.headers;
    if (o.body !== undefined) init.body = o.body;
    const res = await f(o.url, init);
    const text = await res.text();
    if (text.length > (o.maxChars ?? 3_000_000)) {
      return { ok: false, error: new AppError("TOOL_BAD_RESPONSE", `${o.label}: response too large`) };
    }
    return { ok: true, status: res.status, text, retryAfter: res.headers.get("retry-after") };
  } catch (err) {
    if (o.signal?.aborted) return { ok: false, error: new AppError("ABORTED", `${o.label}: aborted`, { cause: err }) };
    if (timeout.aborted) {
      return { ok: false, error: new AppError("TOOL_TIMEOUT", `${o.label}: timed out after ${o.timeoutMs} ms`, { retryable: true, cause: err }) };
    }
    return { ok: false, error: new AppError("TOOL_NETWORK", `${o.label}: network error`, { retryable: true, cause: err }) };
  }
}

export async function fetchJson<T>(o: FetchJsonOptions<T>): Promise<FetchJsonResult<T>> {
  const started = Date.now();
  if (o.cacheKey) {
    const hit = cache.get(o.cacheKey, started);
    if (hit !== undefined) {
      const again = o.schema.safeParse(hit);
      if (again.success) return { data: again.data, cached: true, ms: 0, attempts: 0 };
    }
  }
  const bkey = o.breakerKey ?? hostKey(o.url);
  if (!breakerAllows(bkey, started)) throw new AppError("CIRCUIT_OPEN", `${o.label}: temporarily disabled after repeated failures`);

  const maxAttempts = 1 + (o.retries ?? 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await rawFetch(o);
    let error: AppError;
    let retryAfter: string | null = null;
    if (!r.ok) {
      error = r.error;
    } else if (r.status < 200 || r.status >= 300) {
      const code = classifyStatus(r.status, o.statusCodes);
      error = new AppError(code, `${o.label}: HTTP ${r.status}`, { status: r.status, retryable: RETRYABLE.has(code) });
      retryAfter = r.retryAfter;
    } else {
      let json: unknown;
      try {
        json = JSON.parse(r.text);
      } catch {
        breakerFailure(bkey, Date.now());
        throw new AppError("TOOL_BAD_RESPONSE", `${o.label}: response is not JSON`);
      }
      const parsed = o.schema.safeParse(json);
      if (!parsed.success) {
        breakerFailure(bkey, Date.now());
        const issue = parsed.error.issues[0];
        throw new AppError("TOOL_BAD_RESPONSE", `${o.label}: unexpected shape at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`);
      }
      breakerSuccess(bkey);
      if (o.cacheKey && o.cacheTtlMs) cache.set(o.cacheKey, parsed.data, o.cacheTtlMs, Date.now());
      return { data: parsed.data, cached: false, ms: Date.now() - started, attempts: attempt };
    }
    if (error.code === "ABORTED") throw error;
    if (error.code === "TOOL_QUOTA" || error.code === "TOOL_AUTH") {
      tripBreaker(bkey, 10 * 60_000);
      throw error;
    }
    if (error.retryable && attempt < maxAttempts) {
      await sleep(backoffMs(retryAfter), o.signal);
      continue;
    }
    breakerFailure(bkey, Date.now());
    throw error;
  }
  throw new AppError("INTERNAL", `${o.label}: retry loop exited unexpectedly`);
}
