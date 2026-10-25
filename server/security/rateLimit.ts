/** Best-effort per-IP sliding window (per serverless instance). Protects the Nebius/Tavily credits from casual abuse. */
const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs = 3_600_000, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const oldest = recent[0] ?? now;
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const k of [...hits.keys()].slice(0, 1000)) hits.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}

/** Tests only. */
export function resetRateLimits(): void {
  hits.clear();
}
