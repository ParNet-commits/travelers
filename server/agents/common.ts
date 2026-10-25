/** Shared agent plumbing: run context, LLM calls with timeline events, tool calls with caps and timeline events. */
import type { AgentName, CityPack, ModelRoutes, SSEEventInput, ToolName } from "../../types/travelverse.js";
import type { AppConfig } from "../config.js";
import { AppError, publicMessage, toAppError } from "../errors.js";
import type { LlmClient, LlmJsonRequest, LlmCallMeta } from "../llm/nemotron.js";
import type { RunBudget } from "../runBudget.js";
import type { ToolOut, ToolSuite } from "../tools/types.js";

export type Emit = (ev: SSEEventInput) => void;

export interface AgentDeps {
  llm: LlmClient;
  tools: ToolSuite;
  config: AppConfig;
  findCityPack: (destination: string) => CityPack | null;
  now: () => number;
  today: () => string;
}

export interface AgentRun {
  runId: string;
  signal: AbortSignal;
  budget: RunBudget;
  routes: ModelRoutes;
  emit: Emit;
  deps: AgentDeps;
  state: AgentRunState;
}

export interface AgentRunState {
  llmFatal: AppError | null;
  callSeq: number;
  /** consecutive outage-type LLM failures (network, timeout, overload); 3 in a row = stop calling models this run */
  llmFailStreak: number;
  llmDegradedNoted: boolean;
}

export function newRunState(): AgentRunState {
  return { llmFatal: null, callSeq: 0, llmFailStreak: 0, llmDegradedNoted: false };
}

const OUTAGE_CODES: ReadonlySet<string> = new Set(["LLM_SERVER", "LLM_TIMEOUT", "LLM_OVERLOADED", "LLM_RATE_LIMIT"]);
const OUTAGE_STREAK_LIMIT = 3;

function metaNote(meta: LlmCallMeta): string {
  const parts = [`mode ${meta.responseMode}`];
  if (meta.repaired) parts.push("repaired once");
  if (meta.fallbackFrom) parts.push(`fallback from ${meta.fallbackFrom}`);
  return parts.join("; ").slice(0, 200);
}

/** Calls the LLM and emits an llm_call event. Returns null (never throws, except on abort) so callers fall back. */
export async function llmJson<T>(run: AgentRun, req: LlmJsonRequest<T>): Promise<{ data: T; meta: LlmCallMeta } | null> {
  if (run.state.llmFatal) return null;
  if (run.state.llmFailStreak >= OUTAGE_STREAK_LIMIT) {
    if (!run.state.llmDegradedNoted) {
      run.state.llmDegradedNoted = true;
      run.emit({ type: "thinking", agent: "orchestrator", text: "Nemotron is not responding reliably; continuing with the deterministic agents for the rest of this run." });
    }
    return null;
  }
  const t0 = run.deps.now();
  try {
    const out = await run.deps.llm.callJson(req, { signal: run.signal, budget: run.budget, routes: run.routes });
    run.state.llmFailStreak = 0;
    run.emit({
      type: "llm_call",
      agent: req.agent,
      model: out.meta.model,
      ok: true,
      ms: Math.max(0, Math.round(out.meta.ms)),
      tokensIn: out.meta.tokensIn,
      tokensOut: out.meta.tokensOut,
      reasoningTokens: out.meta.reasoningTokens,
      attempts: Math.max(1, out.meta.attempts),
      note: metaNote(out.meta),
    });
    return out;
  } catch (e) {
    const err = toAppError(e, "LLM_SERVER");
    if (err.code === "ABORTED") throw err;
    if (err.fatalForLive) run.state.llmFatal = err;
    if (OUTAGE_CODES.has(err.code)) run.state.llmFailStreak += 1;
    run.emit({
      type: "llm_call",
      agent: req.agent,
      model: run.routes[req.role],
      ok: false,
      ms: Math.max(0, Math.round(run.deps.now() - t0)),
      tokensIn: 0,
      tokensOut: 0,
      reasoningTokens: 0,
      attempts: 1,
      note: `${err.code}: ${publicMessage(err)}`.slice(0, 200),
    });
    return null;
  }
}

type ArgValue = string | number | boolean;

/** Runs one tool call under the per-agent and per-run caps, emitting tool_call/tool_result. Null on failure. */
export async function withTool<T>(
  run: AgentRun,
  agent: AgentName,
  tool: ToolName,
  args: Record<string, ArgValue>,
  fn: () => Promise<ToolOut<T>>,
): Promise<T | null> {
  try {
    run.budget.beginToolCall(agent);
  } catch (e) {
    const err = toAppError(e);
    run.emit({ type: "thinking", agent, text: `Skipped ${tool}: ${err.message}`.slice(0, 600) });
    return null;
  }
  run.state.callSeq += 1;
  const callId = `c${run.state.callSeq}`;
  const safeArgs: Record<string, ArgValue> = {};
  for (const [k, v] of Object.entries(args)) safeArgs[k] = typeof v === "string" ? v.slice(0, 400) : v;
  run.emit({ type: "tool_call", agent, callId, tool, args: safeArgs });
  const t0 = run.deps.now();
  try {
    const out = await fn();
    if (out.credits) run.budget.recordTavily(out.credits);
    run.emit({ type: "tool_result", agent, callId, tool, ok: true, cached: out.cached, ms: Math.max(0, Math.round(run.deps.now() - t0)), summary: out.summary.slice(0, 300) });
    return out.value;
  } catch (e) {
    const err = toAppError(e, "TOOL_UPSTREAM");
    if (err.code === "ABORTED") throw err;
    run.emit({ type: "tool_result", agent, callId, tool, ok: false, cached: false, ms: Math.max(0, Math.round(run.deps.now() - t0)), summary: `${err.code}: ${err.message}`.slice(0, 300) });
    return null;
  }
}

export function short(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 3)}...` : s;
}
