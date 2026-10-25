/**
 * POST /api/plan  ->  text/event-stream of SSEEvent.
 * Mode resolution: live (default) | replay (preset only). Live falls back to replay when live is disabled,
 * rate-limited, or the AI provider rejects our key/credits. A replay is ALWAYS announced with replay_notice.
 */
import { PlanRequestBody } from "../types/travelverse.js";
import { goldenFor } from "../replay/index.js";
import { getConfig, resolveRoutes } from "../server/config.js";
import { createDeps } from "../server/deps.js";
import { AppError, publicMessage, toAppError } from "../server/errors.js";
import { runPlan } from "../server/orchestrator/runPlan.js";
import { streamGoldenRun } from "../server/replay/golden.js";
import { checkRateLimit, clientKey } from "../server/security/rateLimit.js";
import { createSseResponse, newRunId } from "../server/sse/sse.js";
import { log, recordRun } from "../server/telemetry.js";

function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export async function POST(request: Request): Promise<Response> {
  let cfg;
  try {
    cfg = getConfig();
  } catch (e) {
    return json(500, { code: "CONFIG_INVALID", message: toAppError(e).message });
  }

  const raw = await request.text().catch(() => "");
  if (raw.length > 20_000) return json(413, { code: "INPUT_INVALID", message: "Request too large" });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { code: "INPUT_INVALID", message: "Body must be JSON" });
  }
  const parsed = PlanRequestBody.safeParse(body);
  if (!parsed.success) {
    return json(400, {
      code: "INPUT_INVALID",
      message: "Invalid trip request",
      issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    });
  }

  const { trip, mode, presetId, routeOverride } = parsed.data;
  const golden = goldenFor(presetId);
  const liveAvailable = cfg.liveEnabled && cfg.nebiusApiKey !== null;
  let effective = mode;
  let replayReason = "You chose the recorded demo run.";

  if (mode === "live" && !liveAvailable) {
    if (!golden) return json(503, { code: "LIVE_DISABLED", message: "Live planning is switched off right now. Try the demo replay." });
    effective = "replay";
    replayReason = "Live planning is switched off right now; showing the recorded run.";
  }
  if (effective === "live") {
    const rl = checkRateLimit(clientKey(request), cfg.runsPerIpPerHour);
    if (!rl.ok) {
      if (!golden) {
        return json(429, { code: "RATE_LIMITED_CLIENT", message: publicMessage(new AppError("RATE_LIMITED_CLIENT", "")), retryAfterSec: rl.retryAfterSec }, { "retry-after": String(rl.retryAfterSec) });
      }
      effective = "replay";
      replayReason = "Live-run limit reached for your network; showing the recorded run.";
    }
  }
  if (effective === "replay" && !golden) return json(404, { code: "NOT_FOUND", message: "No recorded run for this preset yet." });

  const { routes, rejected } = resolveRoutes(cfg, routeOverride, request.headers.get("x-tv-admin"));
  const runId = newRunId();
  const deps = createDeps(cfg);
  const startedAt = Date.now();
  const replayOpts = { speed: cfg.replaySpeed, maxGapMs: 1500 };

  return createSseResponse({
    runId,
    signal: request.signal,
    run: async (emit, signal) => {
      if (effective === "replay" && golden) {
        await streamGoldenRun(golden, emit, signal, { ...replayOpts, reason: replayReason });
        recordRun({ at: new Date().toISOString(), destination: trip.destination, mode: "replay", status: "replayed", rounds: 0, estUsd: 0, ms: Date.now() - startedAt, tavilyCredits: 0 });
        return;
      }
      if (rejected.length > 0) emit({ type: "thinking", agent: "orchestrator", text: `Model override: ${rejected.join("; ")}`.slice(0, 600) });

      const result = await runPlan({ runId, request: trip, routes, bailOnLlmFatal: golden !== null }, deps, emit, signal);

      if (result.status === "failed" && result.llmFatal && golden) {
        log("warn", "live_to_replay", { runId, code: result.llmFatal.code });
        await streamGoldenRun(golden, emit, signal, { ...replayOpts, reason: publicMessage(result.llmFatal) });
        recordRun({ at: new Date().toISOString(), destination: trip.destination, mode: "replay", status: "fallback_replay", rounds: result.rounds, estUsd: result.usage.estUsd, ms: Date.now() - startedAt, tavilyCredits: result.usage.tavilyCredits });
        return;
      }

      const u = result.usage;
      emit({ type: "usage", llmCalls: u.llmCalls, toolCalls: u.toolCalls, tokensIn: u.tokensIn, tokensOut: u.tokensOut, estUsd: u.estUsd, tavilyCredits: u.tavilyCredits, elapsedMs: u.elapsedMs });
      emit({ type: "done", status: result.status });
      recordRun({ at: new Date().toISOString(), destination: trip.destination, mode: "live", status: result.status, rounds: result.rounds, estUsd: u.estUsd, ms: u.elapsedMs, tavilyCredits: u.tavilyCredits });
      log("info", "run_done", { runId, status: result.status, rounds: result.rounds, usd: u.estUsd, ms: u.elapsedMs, llmCalls: u.llmCalls });
    },
  });
}

export function GET(): Response {
  return json(405, { code: "METHOD_NOT_ALLOWED", message: "Use POST" });
}
