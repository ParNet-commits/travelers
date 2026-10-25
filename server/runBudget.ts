/** Per-run hard caps: LLM calls, tool calls, tokens, USD, Tavily credits and wall-clock deadline. */
import type { AgentName, ModelRole } from "../types/travelverse.js";
import { LLM_SETTINGS, priceFor, type RunLimits } from "./config.js";
import { AppError } from "./errors.js";

export interface UsageSnapshot {
  llmCalls: number;
  escalationCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  estUsd: number;
  tavilyCredits: number;
  elapsedMs: number;
}

export class RunBudget {
  readonly limits: RunLimits;
  private readonly now: () => number;
  private readonly startedAt: number;
  private llmCalls = 0;
  private escalationCalls = 0;
  private toolCalls = 0;
  private readonly perAgent = new Map<AgentName, number>();
  private tokensIn = 0;
  private tokensOut = 0;
  private reasoningTokens = 0;
  private usd = 0;
  private tavilyCredits = 0;

  constructor(limits: RunLimits, now: () => number = Date.now) {
    this.limits = limits;
    this.now = now;
    this.startedAt = now();
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  remainingMs(): number {
    return this.limits.deadlineMs - this.elapsedMs();
  }

  /**
   * Throws BUDGET_EXCEEDED / DEADLINE before an LLM call that could break a cap.
   * Returns the timeout to use (never longer than the time left minus a 10s safety margin).
   */
  beginLlmCall(role: ModelRole, model: string, promptChars: number, maxTokens: number): number {
    if (this.llmCalls >= this.limits.maxLlmCalls) throw new AppError("BUDGET_EXCEEDED", "LLM call cap reached");
    if (role === "escalation" && this.escalationCalls >= this.limits.maxEscalationCalls) {
      throw new AppError("BUDGET_EXCEEDED", "Escalation model cap reached");
    }
    const estIn = Math.ceil(promptChars / 3.5);
    if (this.tokensIn + this.tokensOut + estIn + maxTokens > this.limits.maxTokens) {
      throw new AppError("BUDGET_EXCEEDED", "Token cap reached");
    }
    const p = priceFor(model);
    const worstUsd = (estIn * p.input + maxTokens * p.output) / 1_000_000;
    if (this.usd + worstUsd > this.limits.maxUsd) throw new AppError("BUDGET_EXCEEDED", "USD cap for this run reached");
    const timeout = Math.min(LLM_SETTINGS[role].timeoutMs, this.remainingMs() - 10_000);
    if (timeout < 8_000) throw new AppError("DEADLINE", "Not enough time left for another model call");
    this.llmCalls += 1;
    if (role === "escalation") this.escalationCalls += 1;
    return timeout;
  }

  recordLlmUsage(model: string, tokensIn: number, tokensOut: number, reasoningTokens: number): void {
    this.tokensIn += tokensIn;
    this.tokensOut += tokensOut;
    this.reasoningTokens += reasoningTokens;
    const p = priceFor(model);
    this.usd += (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
  }

  beginToolCall(agent: AgentName): void {
    if (this.toolCalls >= this.limits.maxToolCalls) throw new AppError("BUDGET_EXCEEDED", "Tool call cap reached");
    const used = this.perAgent.get(agent) ?? 0;
    if (used >= this.limits.maxToolCallsPerAgent) throw new AppError("BUDGET_EXCEEDED", `Tool cap reached for ${agent}`);
    if (this.remainingMs() < 3_000) throw new AppError("DEADLINE", "No time left for tool calls");
    this.toolCalls += 1;
    this.perAgent.set(agent, used + 1);
  }

  canSpendTavily(credits: number): boolean {
    return this.tavilyCredits + credits <= this.limits.maxTavilyCredits;
  }

  recordTavily(credits: number): void {
    this.tavilyCredits += credits;
  }

  snapshot(): UsageSnapshot {
    return {
      llmCalls: this.llmCalls,
      escalationCalls: this.escalationCalls,
      toolCalls: this.toolCalls,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      reasoningTokens: this.reasoningTokens,
      estUsd: Math.round(this.usd * 1_000_000) / 1_000_000,
      tavilyCredits: this.tavilyCredits,
      elapsedMs: this.elapsedMs(),
    };
  }
}
