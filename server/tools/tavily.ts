/**
 * Tavily Search + Extract (+ usage for the Control Room). Every string that comes back is sanitized here,
 * every URL is re-validated, credits are reported so RunBudget can cap them.
 * Credits: search basic = 1; extract basic = 1 per 5 successful URLs. Cached calls cost 0.
 */
import { TavilyExtractResponse, TavilySearchResponse, TavilyUsageResponse } from "../../types/travelverse.js";
import { TIMEOUTS, type AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { fetchJson } from "../http/fetchJson.js";
import { safeUrl, sanitizeExternalText } from "../security/untrusted.js";
import type { ExtractedPage, ToolOut, WebHit } from "./types.js";

const BASE = "https://api.tavily.com";
const STATUS = { 432: "TOOL_QUOTA", 433: "TOOL_QUOTA" } as const;

function headers(cfg: AppConfig): Record<string, string> {
  if (!cfg.tavilyApiKey) throw new AppError("TOOL_AUTH", "TAVILY_API_KEY is not configured");
  return { "content-type": "application/json", authorization: `Bearer ${cfg.tavilyApiKey}` };
}

export async function webSearch(
  cfg: AppConfig,
  args: { query: string; topic: "general" | "news"; timeRange?: "day" | "week" | "month" | "year"; maxResults: number; includeDomains?: string[] },
  signal: AbortSignal,
): Promise<ToolOut<WebHit[]>> {
  const body: Record<string, unknown> = {
    query: args.query.slice(0, 380),
    search_depth: "basic",
    topic: args.topic,
    max_results: Math.min(Math.max(args.maxResults, 1), 10),
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };
  if (args.timeRange) body.time_range = args.timeRange;
  if (args.includeDomains && args.includeDomains.length > 0) body.include_domains = args.includeDomains.slice(0, 20);
  const payload = JSON.stringify(body);
  const r = await fetchJson({
    label: "tavily.search",
    url: `${BASE}/search`,
    method: "POST",
    headers: headers(cfg),
    body: payload,
    schema: TavilySearchResponse,
    timeoutMs: TIMEOUTS.tavilyMs,
    signal,
    statusCodes: STATUS,
    cacheKey: `tvs:${payload}`,
    cacheTtlMs: 6 * 3_600_000,
    breakerKey: "tavily",
  });
  const hits: WebHit[] = [];
  r.data.results.forEach((x) => {
    const url = safeUrl(x.url);
    if (!url) return;
    const hit: WebHit = { id: `W${hits.length + 1}`, title: sanitizeExternalText(x.title, 200), url, content: sanitizeExternalText(x.content, 800) };
    if (x.published_date) hit.publishedDate = sanitizeExternalText(x.published_date, 40);
    hits.push(hit);
  });
  return { value: hits, cached: r.cached, credits: r.cached ? 0 : 1, summary: `${hits.length} result(s) for "${args.query.slice(0, 80)}"` };
}

export async function extract(
  cfg: AppConfig,
  args: { urls: string[]; query: string },
  signal: AbortSignal,
): Promise<ToolOut<{ pages: ExtractedPage[]; failed: Array<{ url: string; error: string }> }>> {
  const urls = [...new Set(args.urls.map((u) => safeUrl(u)).filter((u): u is string => u !== null))].slice(0, 10);
  if (urls.length === 0) return { value: { pages: [], failed: [] }, cached: false, credits: 0, summary: "No valid URLs to extract" };
  const payload = JSON.stringify({ urls, query: args.query.slice(0, 300), chunks_per_source: 3, extract_depth: "basic", format: "text", timeout: 6 });
  const r = await fetchJson({
    label: "tavily.extract",
    url: `${BASE}/extract`,
    method: "POST",
    headers: headers(cfg),
    body: payload,
    schema: TavilyExtractResponse,
    timeoutMs: TIMEOUTS.tavilyMs,
    signal,
    statusCodes: STATUS,
    cacheKey: `tvx:${payload}`,
    cacheTtlMs: 24 * 3_600_000,
    breakerKey: "tavily",
    maxChars: 2_000_000,
  });
  const pages: ExtractedPage[] = [];
  for (const x of r.data.results) {
    const url = safeUrl(x.url);
    const text = x.raw_content ?? "";
    if (url && text.trim().length > 0) pages.push({ url, text: sanitizeExternalText(text, 12_000) });
  }
  const failed = (r.data.failed_results ?? []).map((f) => ({ url: f.url.slice(0, 300), error: (f.error ?? "failed").slice(0, 120) }));
  for (const u of urls) {
    if (!pages.some((p) => p.url === u) && !failed.some((f) => f.url === u)) failed.push({ url: u, error: "empty content" });
  }
  return {
    value: { pages, failed },
    cached: r.cached,
    credits: r.cached ? 0 : Math.ceil(pages.length / 5),
    summary: `${pages.length}/${urls.length} page(s) extracted${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
  };
}

export async function tavilyUsage(cfg: AppConfig, signal: AbortSignal): Promise<{ plan: string; used: number | null; limit: number | null }> {
  if (!cfg.tavilyApiKey) throw new AppError("TOOL_AUTH", "TAVILY_API_KEY is not configured");
  const r = await fetchJson({
    label: "tavily.usage",
    url: `${BASE}/usage`,
    headers: { authorization: `Bearer ${cfg.tavilyApiKey}` },
    schema: TavilyUsageResponse,
    timeoutMs: TIMEOUTS.tavilyMs,
    signal,
    retries: 0,
    breakerKey: "tavily-usage",
  });
  return {
    plan: (r.data.account?.current_plan ?? "unknown").slice(0, 60),
    used: r.data.key?.usage ?? r.data.account?.plan_usage ?? null,
    limit: r.data.key?.limit ?? r.data.account?.plan_limit ?? null,
  };
}
