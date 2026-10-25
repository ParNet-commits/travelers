/**
 * 10-trip mini evaluation (live). Evidence for "Technological Implementation": pass rate, rounds, cost, latency.
 * Usage: npm run eval            (add --dry to list the cases; costs about $0.30-0.60 live)
 */
import { writeFileSync } from "node:fs";
import type { SSEEventInput, TripRequest } from "../types/travelverse.js";
import { riyaPreset } from "../replay/presets.js";
import { getConfig } from "../server/config.js";
import { addDays } from "../server/engine/time.js";
import { createDeps } from "../server/deps.js";
import { runPlan } from "../server/orchestrator/runPlan.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const cfg = getConfig();
const base = riyaPreset();
const trip = (over: Partial<TripRequest>): TripRequest => ({ ...base, ...over });
const open = { stepFreeRequired: false, maxWalkKmPerDay: null, notes: "" };

const CASES: Array<{ name: string; trip: TripRequest }> = [
  { name: "Riya hero (Udaipur, step-free, $900)", trip: base },
  { name: "Udaipur couple, balanced, $1,500", trip: trip({ pace: "balanced", budget: { amountMinor: 150_000, currency: "USD" }, accessibility: open, mood: "Romantic, photography, sunsets" }) },
  { name: "Udaipur tight budget, INR 30,000", trip: trip({ budget: { amountMinor: 3_000_000, currency: "INR" }, accessibility: open, mood: "Backpacking, cheap and cheerful" }) },
  { name: "Udaipur impossible budget, $150", trip: trip({ budget: { amountMinor: 15_000, currency: "USD" } }) },
  { name: "Jaipur (no curated data), $700", trip: trip({ destination: "Jaipur", budget: { amountMinor: 70_000, currency: "USD" }, accessibility: open, mood: "Forts, markets, food" }) },
  { name: "Lisbon 3 days, EUR 1,200", trip: trip({ destination: "Lisbon", origin: "London", endDate: addDays(base.startDate, 2), budget: { amountMinor: 120_000, currency: "EUR" }, pace: "balanced", accessibility: open, mood: "Viewpoints, tiles, seafood" }) },
  { name: "Paris packed, $2,000", trip: trip({ destination: "Paris", origin: "New York", budget: { amountMinor: 200_000, currency: "USD" }, pace: "packed", accessibility: open, mood: "Museums and art, first time in Paris" }) },
  { name: "Istanbul step-free, $1,100", trip: trip({ destination: "Istanbul", origin: "Dubai", budget: { amountMinor: 110_000, currency: "USD" } }) },
  { name: "Kyoto calm, GBP 1,400", trip: trip({ destination: "Kyoto", origin: "London", budget: { amountMinor: 140_000, currency: "GBP" }, accessibility: open, mood: "Temples, gardens, slow mornings" }) },
  { name: "Bangkok family, $800", trip: trip({ destination: "Bangkok", origin: "Singapore", travelers: 4, budget: { amountMinor: 80_000, currency: "USD" }, pace: "balanced", accessibility: open, mood: "Family with kids, markets, river" }) },
];

if (process.argv.includes("--dry")) {
  CASES.forEach((c, i) => console.log(`${i + 1}. ${c.name}: ${c.trip.destination} ${c.trip.startDate}..${c.trip.endDate}`));
  process.exit(0);
}

const rows: string[] = ["| # | Case | Status | Re-plans | Hard left | Fallback | LLM fails | Tool fails | Cost $ | Time s |", "|---|---|---|---|---|---|---|---|---|---|"];
const stats = { finalized: 0, awaiting: 0, failed: 0, usd: 0, secs: [] as number[] };
for (const [i, c] of CASES.entries()) {
  const events: SSEEventInput[] = [];
  const r = await runPlan({ runId: `eval_${i + 1}`, request: c.trip, routes: cfg.models, bailOnLlmFatal: false }, createDeps(cfg), (e) => events.push(e), new AbortController().signal);
  const llmFails = events.filter((e) => e.type === "llm_call" && !e.ok).length;
  const toolFails = events.filter((e) => e.type === "tool_result" && !e.ok).length;
  const hard = r.final?.validation.hardCount ?? "-";
  const secs = r.usage.elapsedMs / 1000;
  stats.usd += r.usage.estUsd;
  stats.secs.push(secs);
  if (r.status === "finalized") stats.finalized += 1;
  else if (r.status === "awaiting_user") stats.awaiting += 1;
  else stats.failed += 1;
  const row = `| ${i + 1} | ${c.name} | ${r.status} | ${r.rounds} | ${hard} | ${r.final?.generatedBy.deterministicFallback ? "yes" : "no"} | ${llmFails} | ${toolFails} | ${r.usage.estUsd.toFixed(4)} | ${secs.toFixed(1)} |`;
  rows.push(row);
  console.log(row);
  await new Promise((res) => setTimeout(res, 2000));
}
const sorted = [...stats.secs].sort((a, b) => a - b);
const summary = [
  "",
  `Finalized automatically: ${stats.finalized}/${CASES.length}; handed to the human with valid options: ${stats.awaiting}; failed: ${stats.failed}.`,
  `Total estimated model cost: $${stats.usd.toFixed(3)} (avg $${(stats.usd / CASES.length).toFixed(4)} per plan).`,
  `Latency p50 ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} s, max ${sorted.at(-1)?.toFixed(1)} s.`,
];
writeFileSync("eval-report.md", `# TravelVerse mini eval (${new Date().toISOString()})\n\n${rows.join("\n")}\n${summary.join("\n")}\n`);
console.log(summary.join("\n"));
