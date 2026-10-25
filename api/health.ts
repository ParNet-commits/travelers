/**
 * GET /api/health            -> public status for the Control Room (booleans only, never secret values)
 * GET /api/health?deep=1     -> admin only (x-tv-admin header): live provider checks, model-id verification, Tavily credits
 */
import { z } from "zod";
import { HealthResponse } from "../types/travelverse.js";
import { GOLDEN_RUNS } from "../replay/index.js";
import { APP_VERSION, getConfig, isAdmin, type AppConfig } from "../server/config.js";
import { toAppError } from "../server/errors.js";
import { fetchJson, httpStats } from "../server/http/fetchJson.js";
import { routeMatrix } from "../server/tools/osm.js";
import { tavilyUsage } from "../server/tools/tavily.js";
import { forecast } from "../server/tools/weather.js";
import { telemetrySnapshot } from "../server/telemetry.js";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

const ModelsList = z.object({ data: z.array(z.object({ id: z.string() })) });
const OverpassPing = z.object({ elements: z.array(z.unknown()) });

type Deep = NonNullable<HealthResponse["deep"]>;

async function deepChecks(cfg: AppConfig, signal: AbortSignal): Promise<Deep> {
  const providers: Deep["providers"] = [];
  let modelIds: string[] = [];
  let tavily: Deep["tavily"] = null;
  const timed = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      providers.push({ name, ok: true, ms: Date.now() - t0, detail: detail.slice(0, 300) });
    } catch (e) {
      const err = toAppError(e, "TOOL_UPSTREAM");
      providers.push({ name, ok: false, ms: Date.now() - t0, detail: `${err.code}: ${err.message}`.slice(0, 300) });
    }
  };
  const udaipur = { lat: 24.5854, lon: 73.7125 };
  const today = new Date().toISOString().slice(0, 10);
  await Promise.all([
    timed("token_factory", async () => {
      if (!cfg.nebiusApiKey) throw new Error("NEBIUS_API_KEY not configured");
      const r = await fetchJson({
        label: "token-factory /models",
        url: `${cfg.nebiusBaseUrl}/models`,
        headers: { authorization: `Bearer ${cfg.nebiusApiKey}` },
        schema: ModelsList,
        timeoutMs: 8000,
        signal,
        retries: 0,
        breakerKey: "tf-models",
      });
      modelIds = r.data.data.map((m) => m.id);
      return `${modelIds.length} models visible`;
    }),
    timed("tavily", async () => {
      const u = await tavilyUsage(cfg, signal);
      tavily = u;
      return `plan ${u.plan}: ${u.used ?? "?"} used of ${u.limit ?? "unlimited"}`;
    }),
    timed("overpass", async () => {
      await fetchJson({ label: "overpass ping", url: `https://overpass-api.de/api/interpreter?data=${encodeURIComponent("[out:json][timeout:5];node(1);out ids;")}`, schema: OverpassPing, timeoutMs: 5000, signal, retries: 0 });
      return "reachable";
    }),
    timed("osrm", async () => {
      const r = await routeMatrix(cfg, [{ id: "a", location: udaipur }, { id: "b", location: { lat: 24.576, lon: 73.683 } }], signal);
      return r.summary;
    }),
    timed("open_meteo", async () => (await forecast(udaipur, today, today, today, signal)).summary),
  ]);
  const ids = [...new Set(Object.values(cfg.models))];
  return {
    checkedAt: new Date().toISOString(),
    providers,
    models: ids.map((id) => {
      const found = modelIds.includes(id);
      return { id, found, note: modelIds.length === 0 ? "model list unavailable" : found ? "listed by /v1/models" : "NOT listed - check the id with npm run probe:models" };
    }),
    tavily,
  };
}

export async function GET(request: Request): Promise<Response> {
  let cfg: AppConfig;
  try {
    cfg = getConfig();
  } catch (e) {
    return json(500, { ok: false, code: "CONFIG_INVALID", message: toAppError(e).message });
  }
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (deep && !isAdmin(cfg, request.headers.get("x-tv-admin"))) return json(401, { code: "ADMIN_REQUIRED", message: "Deep checks need the admin token." });

  const http = httpStats();
  const tel = telemetrySnapshot();
  const body: HealthResponse = {
    ok: true,
    version: APP_VERSION,
    liveEnabled: cfg.liveEnabled && cfg.nebiusApiKey !== null,
    keys: { nebius: cfg.nebiusApiKey !== null, tavily: cfg.tavilyApiKey !== null, admin: cfg.adminToken !== null, contactEmail: cfg.contactEmail !== null },
    models: cfg.models,
    allowlist: cfg.allowlist.slice(0, 20),
    limits: { maxUsdPerRun: cfg.limits.maxUsd, runsPerIpPerHour: cfg.runsPerIpPerHour, maxReplans: cfg.limits.maxReplans, deadlineMs: cfg.limits.deadlineMs },
    replays: GOLDEN_RUNS.map((r) => ({ id: r.id, recordedAt: r.recordedAt })),
    instance: { ...tel, breakers: http.breakers.slice(0, 20), cache: http.cache },
    deep: deep ? await deepChecks(cfg, request.signal) : null,
  };
  return json(200, HealthResponse.parse(body));
}
