/**
 * Verifies model ids, prices and JSON-mode support on YOUR Token Factory account (costs well under $0.01).
 * Prints which TV_JSON_MODE to use and writes probe-report.json (feed it into the feedback report).
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { getConfig } from "../server/config.js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell */
}
const cfg = getConfig();
if (!cfg.nebiusApiKey) {
  console.error("NEBIUS_API_KEY missing (.env.local)");
  process.exit(1);
}
const auth = { authorization: `Bearer ${cfg.nebiusApiKey}`, "content-type": "application/json" };

const Verbose = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      context_length: z.number().nullable().optional(),
      pricing: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).nullable().optional(),
      supported_features: z.array(z.string()).nullable().optional(),
    }),
  ),
});

async function chat(body: Record<string, unknown>): Promise<{ status: number; ms: number; content: string; note: string }> {
  const t0 = Date.now();
  const res = await fetch(`${cfg.nebiusBaseUrl}/chat/completions`, { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let content = "";
  try {
    const j = JSON.parse(text) as { choices?: Array<{ message?: { content?: string | null } }> };
    content = j.choices?.[0]?.message?.content ?? "";
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, ms: Date.now() - t0, content, note: res.ok ? "" : text.slice(0, 160) };
}

const listRes = await fetch(`${cfg.nebiusBaseUrl}/models?verbose=true`, { headers: auth });
const list = Verbose.safeParse(await listRes.json().catch(() => null));
const ids = list.success ? list.data.data.map((m) => m.id) : [];
console.log(`\n/v1/models -> HTTP ${listRes.status}, ${ids.length} models`);
console.log("NVIDIA models visible:", ids.filter((i) => /nvidia|nemotron/i.test(i)).join(", ") || "(none)");

const report: Record<string, unknown> = { at: new Date().toISOString(), baseUrl: cfg.nebiusBaseUrl, models: {} };
const schema = { type: "object", properties: { ok: { type: "boolean" }, n: { type: "integer" } }, required: ["ok", "n"], additionalProperties: false };
const messages = [
  { role: "system", content: 'Return only JSON like {"ok":true,"n":<the number>}.' },
  { role: "user", content: "The number is 7." },
];

for (const [role, model] of Object.entries(cfg.models)) {
  const meta = list.success ? list.data.data.find((m) => m.id === model) : undefined;
  console.log(`\n[${role}] ${model}: ${meta ? "FOUND" : "NOT LISTED"}${meta?.pricing ? ` pricing=${JSON.stringify(meta.pricing)}` : ""}`);
  if (meta?.supported_features) console.log(`  features: ${meta.supported_features.join(", ")}`);
  const modes: Record<string, unknown> = {};
  for (const mode of ["json_schema", "json_object", "none"] as const) {
    const body: Record<string, unknown> = { model, messages, max_tokens: 400, temperature: 0.2, reasoning_effort: "low" };
    if (mode === "json_schema") body.response_format = { type: "json_schema", json_schema: { name: "Probe", schema, strict: true } };
    if (mode === "json_object") body.response_format = { type: "json_object" };
    const r = await chat(body);
    const json = /\{[\s\S]*\}/.exec(r.content.replace(/<think>[\s\S]*?<\/think>/g, ""))?.[0] ?? "";
    let valid = false;
    try {
      valid = (JSON.parse(json) as { n?: number }).n === 7;
    } catch {
      valid = false;
    }
    modes[mode] = { status: r.status, ms: r.ms, validJson: valid, note: r.note };
    console.log(`  ${mode.padEnd(12)} HTTP ${r.status} ${String(r.ms).padStart(6)} ms  valid=${valid} ${r.note}`);
  }
  const effortNone = await chat({ model, messages, max_tokens: 200, reasoning_effort: "none" });
  const thinkingOff = await chat({ model, messages, max_tokens: 200, chat_template_kwargs: { enable_thinking: false } });
  console.log(`  reasoning_effort=none -> HTTP ${effortNone.status} ${effortNone.ms} ms; chat_template_kwargs.enable_thinking=false -> HTTP ${thinkingOff.status} ${thinkingOff.ms} ms`);
  (report.models as Record<string, unknown>)[model] = {
    role,
    listed: Boolean(meta),
    pricing: meta?.pricing ?? null,
    features: meta?.supported_features ?? null,
    modes,
    reasoningEffortNone: effortNone.status,
    enableThinkingFalse: thinkingOff.status,
  };
}

writeFileSync("probe-report.json", JSON.stringify(report, null, 2));
console.log("\nWrote probe-report.json. Set TV_JSON_MODE to the best mode that returned valid=true for ALL three models.");
