/** Test doubles: scripted LLM, deterministic tools, collecting emitter. */
import type { CityPack, SSEEventInput } from "../types/travelverse.js";
import type { AgentDeps } from "../server/agents/common.js";
import { getConfig, type AppConfig } from "../server/config.js";
import { AppError } from "../server/errors.js";
import type { LlmClient, LlmJsonRequest } from "../server/llm/nemotron.js";
import type { ToolSuite } from "../server/tools/types.js";
import { TESTVILLE } from "./fixtures.js";

export function testConfig(extra: Record<string, string> = {}): AppConfig {
  return getConfig({ NEBIUS_API_KEY: "test-nebius-key-123456", TAVILY_API_KEY: "tvly-test-key-123456", ...extra });
}

type Handler = (req: LlmJsonRequest<unknown>, call: number) => unknown;

/** Each schemaName maps to a handler; a handler may return data or an AppError to throw. Output is schema-validated. */
export function scriptedLlm(handlers: Partial<Record<string, Handler>>): LlmClient & { calls: string[] } {
  const counts = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async callJson<T>(req: LlmJsonRequest<T>, run: Parameters<LlmClient["callJson"]>[1]) {
      const model = run.routes[req.role];
      run.budget.beginLlmCall(req.role, model, req.system.length + req.user.length, 1000);
      const n = (counts.get(req.schemaName) ?? 0) + 1;
      counts.set(req.schemaName, n);
      calls.push(`${req.schemaName}#${n}@${req.role}`);
      const h = handlers[req.schemaName];
      if (!h) throw new AppError("LLM_SERVER", `no scripted handler for ${req.schemaName}`);
      const out = h(req as LlmJsonRequest<unknown>, n);
      if (out instanceof AppError) throw out;
      run.budget.recordLlmUsage(model, 1200, 300, 100);
      const data = req.schema.parse(out);
      return { data, meta: { model, ms: 5, tokensIn: 1200, tokensOut: 300, reasoningTokens: 100, attempts: 1, repaired: false, responseMode: "json_object" as const, fallbackFrom: null } };
    },
  };
}

export function fakeTools(over: Partial<ToolSuite> = {}): ToolSuite {
  return {
    geocode: async (q) => ({ value: { name: q, center: { lat: 24.58, lon: 73.69 } }, cached: false, summary: `geocoded ${q}` }),
    findPlaces: async () => ({ value: [], cached: false, summary: "0 places" }),
    routeMatrix: async () => ({ value: null, cached: false, summary: "no matrix" }),
    forecast: async () => ({ value: [], cached: false, summary: "no forecast" }),
    webSearch: async () => ({ value: [], cached: false, credits: 1, summary: "0 results" }),
    extract: async () => ({ value: { pages: [], failed: [] }, cached: false, credits: 0, summary: "0 pages" }),
    ...over,
  };
}

export function makeDeps(llm: LlmClient, tools: ToolSuite = fakeTools(), cfg: AppConfig = testConfig(), pack: CityPack | null = TESTVILLE): AgentDeps {
  return {
    llm,
    tools,
    config: cfg,
    findCityPack: (d) => (pack && d.toLowerCase().includes(pack.name.toLowerCase()) ? pack : null),
    now: Date.now,
    today: () => "2026-10-17",
  };
}

export function collector(): { emit: (e: SSEEventInput) => void; events: SSEEventInput[] } {
  const events: SSEEventInput[] = [];
  return { emit: (e) => events.push(e), events };
}
