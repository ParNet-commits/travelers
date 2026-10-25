/**
 * Measured numbers for the "Most Valuable Feedback" report. Uses the official OpenAI SDK pointed at Token Factory
 * (proves drop-in compatibility). Writes bench-report.md. Cost: well under $0.10.
 * Usage: npm run bench            (add --quick for 1 sample per test)
 */
import { writeFileSync } from "node:fs";
import OpenAI, { APIError } from "openai";
import { getConfig } from "../server/config.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const cfg = getConfig();
if (!cfg.nebiusApiKey) {
  console.error("NEBIUS_API_KEY missing");
  process.exit(1);
}
const client = new OpenAI({ apiKey: cfg.nebiusApiKey, baseURL: cfg.nebiusBaseUrl, maxRetries: 0, timeout: 120_000 });
const N = process.argv.includes("--quick") ? 1 : 3;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const pct = (xs: number[], p: number) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN;
};
const statusOf = (e: unknown) => (e instanceof APIError ? String(e.status) : e instanceof Error ? e.name : "error");
const lines: string[] = [`# Token Factory benchmark (${new Date().toISOString()})`, "", `Base URL: ${cfg.nebiusBaseUrl}, samples per test: ${N}`, ""];
const messages = [{ role: "user" as const, content: "In one short sentence: why do travellers love lake cities?" }];

lines.push("| Model | Non-stream p50 (ms) | TTFT p50 (ms) | Stream total p50 (ms) | Output tok/s | JSON mode valid | Errors |", "|---|---|---|---|---|---|---|");
for (const [role, model] of Object.entries(cfg.models)) {
  const plain: number[] = [];
  const ttft: number[] = [];
  const total: number[] = [];
  const tps: number[] = [];
  const errors: string[] = [];
  let jsonOk = 0;
  for (let i = 0; i < N; i++) {
    try {
      const t0 = performance.now();
      await client.chat.completions.create({ model, messages, max_tokens: 300 });
      plain.push(performance.now() - t0);
    } catch (e) {
      errors.push(`plain:${statusOf(e)}`);
    }
    try {
      const t0 = performance.now();
      let first = 0;
      let outTokens = 0;
      const stream = await client.chat.completions.create({ model, messages, max_tokens: 300, stream: true, stream_options: { include_usage: true } });
      for await (const chunk of stream) {
        const delta: unknown = chunk.choices[0]?.delta;
        const text = isRecord(delta) ? [delta.content, delta.reasoning_content, delta.reasoning].some((x) => typeof x === "string" && x.length > 0) : false;
        if (text && first === 0) first = performance.now() - t0;
        if (chunk.usage) outTokens = chunk.usage.completion_tokens;
      }
      const ms = performance.now() - t0;
      ttft.push(first);
      total.push(ms);
      if (outTokens > 0 && ms > first) tps.push(outTokens / ((ms - first) / 1000));
    } catch (e) {
      errors.push(`stream:${statusOf(e)}`);
    }
    try {
      const r = await client.chat.completions.create({
        model,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: 'Return only JSON: {"city": string, "reason": string}' }, { role: "user", content: "Pick one lake city." }],
      });
      const content = (r.choices[0]?.message.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
      const obj: unknown = JSON.parse(/\{[\s\S]*\}/.exec(content)?.[0] ?? "null");
      if (isRecord(obj) && typeof obj.city === "string") jsonOk += 1;
    } catch (e) {
      errors.push(`json:${statusOf(e)}`);
    }
  }
  const row = `| ${role}: ${model} | ${pct(plain, 50).toFixed(0)} | ${pct(ttft, 50).toFixed(0)} | ${pct(total, 50).toFixed(0)} | ${pct(tps, 50).toFixed(1)} | ${jsonOk}/${N} | ${errors.join(", ") || "none"} |`;
  lines.push(row);
  console.log(row);
}

lines.push("", "## Concurrency (5 parallel calls, fast model)");
{
  const t0 = performance.now();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => client.chat.completions.create({ model: cfg.models.fast, messages, max_tokens: 150 })));
  const wall = performance.now() - t0;
  const failed = results.filter((r) => r.status === "rejected").map((r) => (r.status === "rejected" ? statusOf(r.reason) : ""));
  lines.push(`Wall time ${wall.toFixed(0)} ms, ${5 - failed.length}/5 succeeded${failed.length ? `, failures: ${failed.join(", ")}` : ""}.`);
}

lines.push("", "## Tool calling (fast model, OpenAI tools format)");
try {
  const r = await client.chat.completions.create({
    model: cfg.models.fast,
    max_tokens: 800,
    messages: [{ role: "user", content: "What is the forecast for Udaipur tomorrow? Use the tool." }],
    tools: [{ type: "function", function: { name: "get_forecast", description: "Daily forecast for a city", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }],
    tool_choice: "auto",
  });
  const calls = r.choices[0]?.message.tool_calls ?? [];
  const names = calls.map((c) => (c.type === "function" ? `${c.function.name}(${c.function.arguments})` : c.type));
  lines.push(calls.length > 0 ? `Returned ${calls.length} tool call(s): ${names.join("; ")}` : "No tool_calls returned (model answered in text).");
} catch (e) {
  lines.push(`Tool calling request failed: HTTP ${statusOf(e)}`);
}

lines.push("", "## Error semantics");
for (const [label, body] of [
  ["unknown model id", { model: "nvidia/does-not-exist", messages, max_tokens: 10 }],
  ["max_tokens=1", { model: cfg.models.fast, messages, max_tokens: 1 }],
] as const) {
  try {
    const r = await client.chat.completions.create(body);
    lines.push(`- ${label}: HTTP 200, finish_reason=${r.choices[0]?.finish_reason ?? "?"}`);
  } catch (e) {
    lines.push(`- ${label}: HTTP ${statusOf(e)}${e instanceof APIError ? ` (${e.message.slice(0, 120)})` : ""}`);
  }
}

writeFileSync("bench-report.md", `${lines.join("\n")}\n`);
console.log("\nWrote bench-report.md");
