/**
 * Nebius Token Factory client (OpenAI-compatible /v1/chat/completions) for Nemotron models.
 * Guarantees: JSON validated by Zod or a typed error; one transient retry; feature downgrade on 400
 * (json_schema -> json_object -> plain, then drop reasoning_effort); <think> stripping; one repair call;
 * model fallback chain; every attempt checked against the RunBudget before it is sent.
 */
import { z } from "zod";
import type { AgentName, ModelRole, ModelRoutes } from "../../types/travelverse.js";
import { LLM_SETTINGS, MODEL_FALLBACK, type AppConfig, type JsonMode, type ReasoningEffort } from "../config.js";
import { AppError, toAppError, type ErrorCode } from "../errors.js";
import { sleep } from "../http/fetchJson.js";
import type { RunBudget } from "../runBudget.js";
import { parseFirstValid, stripThink } from "./json.js";
import { REPAIR_SYSTEM } from "./prompts.js";

export interface LlmJsonRequest<T> {
  agent: AgentName;
  role: ModelRole;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface LlmCallMeta {
  model: string;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  attempts: number;
  repaired: boolean;
  responseMode: JsonMode;
  fallbackFrom: string | null;
}

export interface LlmRunCtx {
  signal: AbortSignal;
  budget: RunBudget;
  routes: ModelRoutes;
}

export interface LlmClient {
  callJson<T>(req: LlmJsonRequest<T>, run: LlmRunCtx): Promise<{ data: T; meta: LlmCallMeta }>;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

const ChatResponse = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z
          .object({
            content: z
              .union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))])
              .nullable()
              .optional(),
            refusal: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      completion_tokens_details: z.object({ reasoning_tokens: z.number().nullable().optional() }).nullable().optional(),
    })
    .nullable()
    .optional(),
});

type PostResult =
  | { ok: true; content: string; finishReason: string | null; refusal: string | null; usage: { in: number; out: number; reasoning: number } }
  | { ok: false; error: AppError };

const LOWER_EFFORT: Readonly<Record<ReasoningEffort, ReasoningEffort>> = { high: "medium", medium: "low", low: "none", none: "none" };
const STOP_CHAIN: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["LLM_AUTH", "LLM_QUOTA", "BUDGET_EXCEEDED", "DEADLINE", "ABORTED", "LLM_REFUSAL"]);

/** Learned per model during this instance's lifetime: which response_format the endpoint accepts. */
const modeCache = new Map<string, JsonMode>();
const schemaJsonCache = new WeakMap<object, unknown>();

export function jsonSchemaOf(schema: z.ZodType): unknown {
  const hit = schemaJsonCache.get(schema);
  if (hit !== undefined) return hit;
  const js = z.toJSONSchema(schema, { unrepresentable: "any" });
  schemaJsonCache.set(schema, js);
  return js;
}

export function classifyLlmStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return "LLM_AUTH";
  if (status === 402) return "LLM_QUOTA";
  if (status === 404) return "LLM_MODEL_NOT_FOUND";
  if (status === 429) return "LLM_RATE_LIMIT";
  if (status === 503 || status === 529) return "LLM_OVERLOADED";
  if (status >= 500) return "LLM_SERVER";
  return "LLM_BAD_REQUEST";
}

function safeSnippet(text: string): string {
  return text.replace(/(Bearer\s+)?[A-Za-z0-9_\-.]{32,}/g, "[redacted]").replace(/\s+/g, " ").slice(0, 200);
}

export function createNemotronClient(cfg: AppConfig, fetchImpl: typeof fetch = fetch): LlmClient {
  async function post(body: Record<string, unknown>, timeoutMs: number, signal: AbortSignal): Promise<PostResult> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = AbortSignal.any([timeout, signal]);
    let status = 0;
    let text = "";
    try {
      const res = await fetchImpl(`${cfg.nebiusBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.nebiusApiKey ?? ""}` },
        body: JSON.stringify(body),
        signal: combined,
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      if (signal.aborted) return { ok: false, error: new AppError("ABORTED", "LLM call aborted", { cause: err }) };
      if (timeout.aborted) return { ok: false, error: new AppError("LLM_TIMEOUT", `Model did not answer within ${Math.round(timeoutMs / 1000)} s`, { cause: err }) };
      return { ok: false, error: new AppError("LLM_SERVER", "Network error calling Token Factory", { retryable: true, cause: err }) };
    }
    if (status < 200 || status >= 300) {
      const code = classifyLlmStatus(status);
      return { ok: false, error: new AppError(code, `Token Factory HTTP ${status}: ${safeSnippet(text)}`, { status }) };
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: new AppError("LLM_SERVER", "Token Factory returned non-JSON") };
    }
    const parsed = ChatResponse.safeParse(json);
    if (!parsed.success) return { ok: false, error: new AppError("LLM_SERVER", "Unexpected chat completion shape") };
    const choice = parsed.data.choices[0];
    const raw = choice?.message?.content;
    const content = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? "").join("") : "";
    const u = parsed.data.usage;
    const promptChars = JSON.stringify(body.messages ?? "").length;
    return {
      ok: true,
      content,
      finishReason: choice?.finish_reason ?? null,
      refusal: choice?.message?.refusal ?? null,
      usage: {
        in: u?.prompt_tokens ?? Math.ceil(promptChars / 3.5),
        out: u?.completion_tokens ?? Math.ceil(content.length / 3.5),
        reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
      },
    };
  }

  async function attemptModel<T>(model: string, budgetRole: ModelRole, req: LlmJsonRequest<T>, run: LlmRunCtx): Promise<{ data: T; meta: LlmCallMeta }> {
    const settings = LLM_SETTINGS[req.role];
    let mode: JsonMode = modeCache.get(model) ?? cfg.jsonMode;
    let effort: ReasoningEffort | null = req.reasoningEffort ?? settings.reasoningEffort;
    let maxTokens = req.maxTokens ?? settings.maxTokens;
    const temperature = req.temperature ?? settings.temperature;
    const schemaJson = jsonSchemaOf(req.schema);
    const schemaText = JSON.stringify(schemaJson);
    let messages: ChatMessage[] = [
      {
        role: "system",
        content: `${req.system}\n\nOUTPUT FORMAT: Return exactly one JSON object that matches this JSON Schema. No markdown, no code fences, no text before or after it.\n${schemaText}`,
      },
      { role: "user", content: req.user },
    ];
    let attempts = 0;
    let repaired = false;
    let lengthRetried = false;
    let transientRetried = false;
    let compatSteps = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let reasoningTokens = 0;
    const started = Date.now();

    while (attempts < 6) {
      attempts += 1;
      const promptChars = messages.reduce((s, m) => s + m.content.length, 0);
      const timeoutMs = run.budget.beginLlmCall(budgetRole, model, promptChars, maxTokens);
      const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature, top_p: settings.topP, stream: false };
      if (mode === "json_schema") body.response_format = { type: "json_schema", json_schema: { name: req.schemaName, schema: schemaJson, strict: true } };
      else if (mode === "json_object") body.response_format = { type: "json_object" };
      if (effort !== null) body.reasoning_effort = effort;

      const r = await post(body, timeoutMs, run.signal);
      if (!r.ok) {
        const err = r.error;
        if (err.code === "LLM_BAD_REQUEST" && compatSteps < 3) {
          if (mode === "json_schema") mode = "json_object";
          else if (mode === "json_object") mode = "none";
          else if (effort !== null) effort = null;
          else throw err;
          compatSteps += 1;
          modeCache.set(model, mode);
          continue;
        }
        if ((err.code === "LLM_RATE_LIMIT" || err.code === "LLM_OVERLOADED" || err.code === "LLM_SERVER") && !transientRetried) {
          transientRetried = true;
          await sleep(err.code === "LLM_OVERLOADED" ? 2000 : 700 + Math.floor(Math.random() * 800), run.signal);
          continue;
        }
        throw err;
      }
      tokensIn += r.usage.in;
      tokensOut += r.usage.out;
      reasoningTokens += r.usage.reasoning;
      run.budget.recordLlmUsage(model, r.usage.in, r.usage.out, r.usage.reasoning);
      if (r.refusal) throw new AppError("LLM_REFUSAL", `Model refused: ${r.refusal.slice(0, 120)}`);

      const { text, unterminated } = stripThink(r.content);
      const parsed = parseFirstValid(text, req.schema);
      if (parsed.ok) {
        return {
          data: parsed.data,
          meta: { model, ms: Date.now() - started, tokensIn, tokensOut, reasoningTokens, attempts, repaired, responseMode: mode, fallbackFrom: null },
        };
      }
      if ((r.finishReason === "length" || unterminated) && !lengthRetried) {
        lengthRetried = true;
        effort = effort === null ? null : LOWER_EFFORT[effort];
        maxTokens = Math.min(Math.ceil(maxTokens * 1.5), 12_000);
        continue;
      }
      if (!repaired) {
        repaired = true;
        messages = [
          { role: "system", content: `${REPAIR_SYSTEM}\n\nTARGET JSON SCHEMA:\n${schemaText}` },
          { role: "user", content: `VALIDATION ERRORS:\n${parsed.issues}\n\nOUTPUT TO FIX:\n${text.slice(0, 6000)}` },
        ];
        effort = effort === null ? null : "low";
        continue;
      }
      throw new AppError("LLM_SCHEMA", `${req.schemaName}: output did not match the schema after one repair`);
    }
    throw new AppError("LLM_SCHEMA", `${req.schemaName}: too many attempts`);
  }

  return {
    async callJson<T>(req: LlmJsonRequest<T>, run: LlmRunCtx) {
      if (!cfg.nebiusApiKey) throw new AppError("LLM_AUTH", "NEBIUS_API_KEY is not configured");
      const roles = MODEL_FALLBACK[req.role];
      const seen = new Set<string>();
      let lastErr: AppError | null = null;
      let first: string | null = null;
      for (const role of roles) {
        const model = run.routes[role];
        if (seen.has(model)) continue;
        seen.add(model);
        first ??= model;
        try {
          const out = await attemptModel(model, role, req, run);
          return { data: out.data, meta: { ...out.meta, fallbackFrom: model === first ? null : first } };
        } catch (e) {
          const err = toAppError(e, "LLM_SERVER");
          if (STOP_CHAIN.has(err.code)) throw err;
          lastErr = err;
        }
      }
      throw lastErr ?? new AppError("LLM_SERVER", "No model available");
    },
  };
}

/** Tests only. */
export function resetLlmState(): void {
  modeCache.clear();
}
