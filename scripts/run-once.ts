/**
 * One live run from the command line, printed as a readable event log (no files written).
 * Usage: npm run run:once                 (Riya preset)
 *        npm run run:once -- trip.json    (any TripRequest JSON file)
 */
import { readFileSync } from "node:fs";
import { TripRequest, type SSEEventInput } from "../types/travelverse.js";
import { riyaPreset } from "../replay/presets.js";
import { getConfig } from "../server/config.js";
import { createDeps } from "../server/deps.js";
import { formatMoney } from "../server/engine/money.js";
import { runPlan } from "../server/orchestrator/runPlan.js";
import { newRunId } from "../server/sse/sse.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const cfg = getConfig();
const file = process.argv[2];
const trip = file ? TripRequest.parse(JSON.parse(readFileSync(file, "utf8"))) : riyaPreset();
const t0 = Date.now();

function line(e: SSEEventInput): string {
  switch (e.type) {
    case "thinking":
      return `${e.agent}: ${e.text}`;
    case "llm_call":
      return `${e.agent} -> ${e.model} ${e.ok ? "ok" : "FAILED"} ${e.ms} ms, ${e.tokensIn}/${e.tokensOut} tokens, ${e.note}`;
    case "tool_call":
      return `${e.agent} calls ${e.tool} ${JSON.stringify(e.args)}`;
    case "tool_result":
      return `${e.tool} ${e.ok ? "ok" : "FAILED"}${e.cached ? " (cached)" : ""} ${e.ms} ms: ${e.summary}`;
    case "rule_check":
      return `round ${e.round} ${e.outcome.ruleId} ${e.outcome.status.toUpperCase()} - ${e.outcome.note}`;
    case "critic_flag":
      return `round ${e.round} FLAG ${e.violation.ruleId} ${e.violation.code}: ${e.violation.message}`;
    case "replan":
      return `REPLAN round ${e.round} with ${e.model}: ${e.directives.map((d) => d.op).join(", ")}`;
    case "draft":
      return `draft round ${e.round}: ${formatMoney(e.itinerary.costs.grandTotalMinor, e.itinerary.costs.currency)} of ${formatMoney(e.itinerary.costs.budgetMinor, e.itinerary.costs.currency)}, hard ${e.itinerary.validation.hardCount}, soft ${e.itinerary.validation.softCount}`;
    case "tradeoff_required":
      return `NEEDS HUMAN: ${e.options.map((o) => `${o.id} ${o.title} (${formatMoney(o.itinerary.costs.grandTotalMinor, o.itinerary.costs.currency)})`).join(" | ")}`;
    case "plan_finalized":
      return `FINAL: ${formatMoney(e.itinerary.costs.grandTotalMinor, e.itinerary.costs.currency)}, audit ${e.itinerary.audit.badge}`;
    case "error":
      return `ERROR ${e.code}: ${e.message}`;
    default:
      return e.type;
  }
}

const res = await runPlan(
  { runId: newRunId(), request: trip, routes: cfg.models, bailOnLlmFatal: false },
  createDeps(cfg),
  (e) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${e.type.padEnd(17)} ${line(e)}`),
  new AbortController().signal,
);
const u = res.usage;
console.log(`\nstatus=${res.status} rounds=${res.rounds} llmCalls=${u.llmCalls} toolCalls=${u.toolCalls} tokens=${u.tokensIn}/${u.tokensOut} estUsd=${u.estUsd} tavilyCredits=${u.tavilyCredits} time=${(u.elapsedMs / 1000).toFixed(1)}s`);
