/**
 * Single place where secrets, model routes, limits and timeouts live.
 * Secrets come ONLY from environment variables (Vercel Project Settings or .env.local). Never from the client.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ModelRole, ModelRoutes } from "../types/travelverse.js";
import { AppError } from "./errors.js";

export const APP_VERSION = "0.1.0";

export const DEFAULT_MODELS: ModelRoutes = {
  fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  planner: "nvidia/nemotron-3-super-120b-a12b",
  escalation: "nvidia/Nemotron-3-Ultra-550b-a55b",
};

/** USD per 1M tokens, from the Token Factory model catalog. Re-check with `npm run probe:models`. */
export const MODEL_PRICES_PER_M: Readonly<Record<string, { input: number; output: number }>> = {
  "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B": { input: 0.06, output: 0.24 },
  "nvidia/nemotron-3-super-120b-a12b": { input: 0.3, output: 0.9 },
  "nvidia/Nemotron-3-Ultra-550b-a55b": { input: 1.0, output: 3.0 },
};
/** Unknown (override) models are priced conservatively so spend caps stay safe. */
export const UNKNOWN_MODEL_PRICE = { input: 1.0, output: 3.0 } as const;

export type ReasoningEffort = "none" | "low" | "medium" | "high";
export type JsonMode = "json_schema" | "json_object" | "none";

export interface LlmRoleSettings {
  maxTokens: number;
  temperature: number;
  topP: number;
  reasoningEffort: ReasoningEffort;
  timeoutMs: number;
}

export const LLM_SETTINGS: Readonly<Record<ModelRole, LlmRoleSettings>> = {
  fast: { maxTokens: 2500, temperature: 0.4, topP: 0.95, reasoningEffort: "low", timeoutMs: 30_000 },
  planner: { maxTokens: 6000, temperature: 0.6, topP: 0.95, reasoningEffort: "medium", timeoutMs: 75_000 },
  escalation: { maxTokens: 8000, temperature: 0.6, topP: 0.95, reasoningEffort: "high", timeoutMs: 100_000 },
};

/** Fallback chain when a model is missing, overloaded or times out. */
export const MODEL_FALLBACK: Readonly<Record<ModelRole, readonly ModelRole[]>> = {
  fast: ["fast", "planner"],
  planner: ["planner", "fast"],
  escalation: ["escalation", "planner"],
};

export const TIMEOUTS = {
  nominatimMs: 5_000,
  overpassMs: 5_000,
  osrmMs: 5_000,
  openMeteoMs: 5_000,
  tavilyMs: 8_000,
} as const;

export interface RunLimits {
  maxLlmCalls: number;
  maxEscalationCalls: number;
  maxToolCalls: number;
  maxToolCallsPerAgent: number;
  maxTokens: number;
  maxUsd: number;
  deadlineMs: number;
  maxTavilyCredits: number;
  maxReplans: number;
}

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NEBIUS_API_KEY: z.string().min(10).optional(),
  TAVILY_API_KEY: z.string().min(10).optional(),
  TV_ADMIN_TOKEN: z.string().min(24, "TV_ADMIN_TOKEN must be at least 24 characters").optional(),
  TV_CONTACT_EMAIL: z.email().optional(),
  TV_NEBIUS_BASE_URL: z.url({ protocol: /^https$/ }).default("https://api.tokenfactory.nebius.com/v1"),
  TV_MODEL_FAST: z.string().min(3).max(120).default(DEFAULT_MODELS.fast),
  TV_MODEL_PLANNER: z.string().min(3).max(120).default(DEFAULT_MODELS.planner),
  TV_MODEL_ESCALATION: z.string().min(3).max(120).default(DEFAULT_MODELS.escalation),
  TV_MODEL_ALLOWLIST: z.string().max(2000).default(""),
  TV_JSON_MODE: z.enum(["json_schema", "json_object", "none"]).default("json_object"),
  TV_LIVE_ENABLED: flag.default(true),
  TV_MAX_USD_PER_RUN: z.coerce.number().min(0.01).max(5).default(0.1),
  TV_RUNS_PER_IP_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(6),
  TV_REPLAY_SPEED: z.coerce.number().min(0.5).max(10).default(1.5),
});

export interface AppConfig {
  nebiusApiKey: string | null;
  tavilyApiKey: string | null;
  adminToken: string | null;
  contactEmail: string | null;
  nebiusBaseUrl: string;
  models: ModelRoutes;
  allowlist: string[];
  jsonMode: JsonMode;
  liveEnabled: boolean;
  runsPerIpPerHour: number;
  replaySpeed: number;
  limits: RunLimits;
}

let cached: AppConfig | null = null;

/** Reads and validates process.env once. Throws CONFIG_INVALID naming the bad variables (never their values). */
export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if ((k.startsWith("TV_") || k === "NEBIUS_API_KEY" || k === "TAVILY_API_KEY") && v !== undefined && v.trim() !== "") {
      cleaned[k] = v.trim();
    }
  }
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?")))].join(", ");
    throw new AppError("CONFIG_INVALID", `Invalid environment variables: ${names}`);
  }
  const e = parsed.data;
  const models: ModelRoutes = { fast: e.TV_MODEL_FAST, planner: e.TV_MODEL_PLANNER, escalation: e.TV_MODEL_ESCALATION };
  const extra = e.TV_MODEL_ALLOWLIST.split(",").map((s) => s.trim()).filter((s) => s.length >= 3);
  const allowlist = [...new Set([...Object.values(DEFAULT_MODELS), ...Object.values(models), ...extra])];
  const cfg: AppConfig = {
    nebiusApiKey: e.NEBIUS_API_KEY ?? null,
    tavilyApiKey: e.TAVILY_API_KEY ?? null,
    adminToken: e.TV_ADMIN_TOKEN ?? null,
    contactEmail: e.TV_CONTACT_EMAIL ?? null,
    nebiusBaseUrl: e.TV_NEBIUS_BASE_URL.replace(/\/+$/, ""),
    models,
    allowlist,
    jsonMode: e.TV_JSON_MODE,
    liveEnabled: e.TV_LIVE_ENABLED,
    runsPerIpPerHour: e.TV_RUNS_PER_IP_PER_HOUR,
    replaySpeed: e.TV_REPLAY_SPEED,
    limits: {
      maxLlmCalls: 16,
      maxEscalationCalls: 2,
      maxToolCalls: 20,
      maxToolCallsPerAgent: 8,
      maxTokens: 160_000,
      maxUsd: e.TV_MAX_USD_PER_RUN,
      deadlineMs: 240_000,
      maxTavilyCredits: 10,
      maxReplans: 3,
    },
  };
  if (env === process.env) cached = cfg;
  return cfg;
}

/** Tests only. */
export function resetConfigCache(): void {
  cached = null;
}

export function priceFor(model: string): { input: number; output: number } {
  return MODEL_PRICES_PER_M[model] ?? UNKNOWN_MODEL_PRICE;
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** Constant-time admin token check. Returns false when no admin token is configured. */
export function isAdmin(cfg: AppConfig, header: string | null): boolean {
  if (!cfg.adminToken || !header) return false;
  return timingSafeEqual(sha256(header), sha256(cfg.adminToken));
}

/** Applies an admin model override. Non-admin overrides and non-allowlisted ids are ignored and reported. */
export function resolveRoutes(
  cfg: AppConfig,
  override: Partial<ModelRoutes> | null,
  adminHeader: string | null,
): { routes: ModelRoutes; rejected: string[] } {
  const routes: ModelRoutes = { ...cfg.models };
  const rejected: string[] = [];
  if (!override) return { routes, rejected };
  if (!isAdmin(cfg, adminHeader)) return { routes, rejected: ["override ignored: admin token missing or wrong"] };
  for (const role of ["fast", "planner", "escalation"] as const) {
    const id = override[role];
    if (id === undefined) continue;
    if (cfg.allowlist.includes(id)) routes[role] = id;
    else rejected.push(`${role}: ${id} is not on the allowlist`);
  }
  return { routes, rejected };
}
