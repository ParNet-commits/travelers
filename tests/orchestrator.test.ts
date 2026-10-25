import { createParser } from "eventsource-parser";
import { describe, expect, it } from "vitest";
import { SSEEvent, type SSEEventInput } from "../types/travelverse.js";
import { AppError } from "../server/errors.js";
import { runPlan } from "../server/orchestrator/runPlan.js";
import { createSseResponse } from "../server/sse/sse.js";
import { TESTVILLE, riyaLikeRequest } from "./fixtures.js";
import { collector, fakeTools, makeDeps, scriptedLlm, testConfig } from "./fakes.js";

const routes = testConfig().models;

const AMBITIOUS = {
  lodgingId: "testville:hotel-premium",
  mealTier: "premium",
  days: [
    { dayIndex: 0, theme: "Lakeside arrival", placeIds: ["testville:lake-boat", "testville:sunset"] },
    { dayIndex: 1, theme: "Royal day", placeIds: ["testville:palace", "testville:temple"] },
    { dayIndex: 2, theme: "Hills", placeIds: ["testville:fort", "testville:garden"] },
    { dayIndex: 3, theme: "Farewell", placeIds: ["testville:market"] },
  ],
  rationale: "A special anniversary deserves the lake palace.",
};

const CRITIC = {
  summary: "Switch to the step-free garden hotel and swap the stair-heavy stops.",
  directives: [
    { op: "change_lodging", lodgingId: "testville:hotel-mid", reason: "Step-free and far cheaper", addresses: ["R1"] },
    { op: "change_meal_tier", mealTier: "mid", reason: "Fits the budget", addresses: ["R1"] },
    { op: "swap_place", placeId: "testville:palace", replacementId: "testville:museum", reason: "Step-free heritage alternative", addresses: ["R6"] },
    { op: "swap_place", placeId: "testville:temple", replacementId: "testville:car-museum", reason: "Step-free", addresses: ["R6"] },
    { op: "drop_place", placeId: "testville:fort", reason: "Steep climb", addresses: ["R6"] },
  ],
};

/** Round-1 planner "forgets" to drop the fort: the orchestrator must enforce the directive. */
const REPLAN = {
  lodgingId: "testville:hotel-mid",
  mealTier: "mid",
  days: [
    { dayIndex: 0, theme: "Lakeside arrival", placeIds: ["testville:lake-boat", "testville:sunset"] },
    { dayIndex: 1, theme: "Crafts and classics", placeIds: ["testville:museum", "testville:car-museum"] },
    { dayIndex: 2, theme: "Gardens", placeIds: ["testville:fort", "testville:garden"] },
    { dayIndex: 3, theme: "Farewell", placeIds: [] },
  ],
  rationale: "Same mood, every stop step-free.",
};

const specialists = {
  MoodProfile: () => ({ vibeTags: ["romantic", "calm"], rankedPlaceIds: ["testville:lake-boat", "testville:sunset", "testville:palace", "testville:garden"], avoidCategories: [], summary: "A gentle, romantic anniversary." }),
  ExplorePlan: () => ({ categories: ["heritage", "viewpoint", "garden"], radiusKm: 6, note: "Calm sights close to the lake." }),
  BudgetStrategy: () => ({ lodgingTier: "premium", mealTier: "premium", splitPct: { lodging: 50, food: 25, activities: 10, transport: 10, buffer: 5 }, rationale: "Splurge for the anniversary." }),
};

const types = (events: SSEEventInput[]) => events.map((e) => e.type);

describe("runPlan (agent loop)", () => {
  it("hero story: over budget + stairs -> critic -> re-plan -> finalized, with directive enforcement", async () => {
    const llm = scriptedLlm({ ...specialists, PlannerDraft: (_r, n) => (n === 1 ? AMBITIOUS : REPLAN), CriticFeedback: () => CRITIC });
    const c = collector();
    const res = await runPlan({ runId: "run_t1", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("finalized");
    expect(res.rounds).toBe(1);
    const t = types(c.events);
    expect(t[0]).toBe("run_started");
    expect(t).toContain("critic_flag");
    expect(t).toContain("replan");
    expect(t.at(-1)).toBe("plan_finalized");
    expect(t.filter((x) => x === "rule_check")).toHaveLength(18);
    const enforced = c.events.find((e) => e.type === "thinking" && e.text.startsWith("Enforced"));
    expect(enforced).toBeDefined();
    const final = res.final;
    expect(final?.validation.passed).toBe(true);
    expect(final?.days.flatMap((d) => d.items).some((i) => i.kind === "visit" && i.placeId === "testville:fort")).toBe(false);
    expect(llm.calls).toEqual(expect.arrayContaining(["PlannerDraft#1@planner", "CriticFeedback#1@planner", "PlannerDraft#2@planner"]));
  });

  it("an unhelpful critic is replaced by the rule-based critic and the loop still converges", async () => {
    const llm = scriptedLlm({ ...specialists, PlannerDraft: () => AMBITIOUS, CriticFeedback: () => ({ summary: "No idea.", directives: [] }) });
    const c = collector();
    const res = await runPlan({ runId: "run_t2", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("finalized");
    expect(res.rounds).toBe(1);
    expect(llm.calls).toContain("CriticFeedback#1@planner");
  });

  it("escalates on round 3, then asks the human with fully valid options", async () => {
    const stubborn = { summary: "Keep the premium dinners.", directives: [{ op: "change_meal_tier", mealTier: "premium", reason: "keep", addresses: ["R1"] }] };
    const llm = scriptedLlm({ ...specialists, PlannerDraft: () => AMBITIOUS, CriticFeedback: () => stubborn });
    const c = collector();
    const res = await runPlan({ runId: "run_t3", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("awaiting_user");
    expect(res.rounds).toBe(3);
    expect(llm.calls).toContain("PlannerDraft#4@escalation");
    const replans = c.events.filter((e) => e.type === "replan");
    expect(replans).toHaveLength(3);
    const last = replans.at(-1);
    expect(last?.type === "replan" && last.model).toBe(routes.escalation);
    const trade = c.events.find((e) => e.type === "tradeoff_required");
    expect(trade).toBeDefined();
    if (trade?.type === "tradeoff_required") {
      expect(trade.options.length).toBeGreaterThanOrEqual(1);
      for (const o of trade.options) expect(o.itinerary.validation.passed).toBe(true);
    }
  });

  it("produces a deterministic plan when every model call fails", async () => {
    const down = () => new AppError("LLM_OVERLOADED", "down");
    const llm = scriptedLlm({ MoodProfile: down, ExplorePlan: down, BudgetStrategy: down, PlannerDraft: down, CriticFeedback: down });
    const c = collector();
    const res = await runPlan({ runId: "run_t4", request: riyaLikeRequest(), routes, bailOnLlmFatal: true }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("finalized");
    expect(res.final?.generatedBy.deterministicFallback).toBe(true);
    expect(c.events.some((e) => e.type === "llm_call" && !e.ok)).toBe(true);
  });

  it("bails out on auth/quota errors so the API layer can switch to replay", async () => {
    const quota = () => new AppError("LLM_QUOTA", "402");
    const llm = scriptedLlm({ MoodProfile: quota, ExplorePlan: quota, BudgetStrategy: quota, PlannerDraft: quota, CriticFeedback: quota });
    const res = await runPlan({ runId: "run_t5", request: riyaLikeRequest(), routes, bailOnLlmFatal: true }, makeDeps(llm), collector().emit, new AbortController().signal);
    expect(res.status).toBe("failed");
    expect(res.llmFatal?.code).toBe("LLM_QUOTA");
  });

  it("skips AI rounds for an impossible budget and offers options", async () => {
    const llm = scriptedLlm({ ...specialists, PlannerDraft: () => AMBITIOUS, CriticFeedback: () => CRITIC });
    const c = collector();
    const res = await runPlan({ runId: "run_t6", request: riyaLikeRequest({ budget: { amountMinor: 20000, currency: "USD" } }), routes, bailOnLlmFatal: false }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("awaiting_user");
    expect(llm.calls.some((x) => x.startsWith("PlannerDraft"))).toBe(false);
  });

  it("Tavily evidence on a drafted stop drives the correction (hero mechanism)", async () => {
    const pack = {
      ...TESTVILLE,
      places: [
        ...TESTVILLE.places,
        {
          id: "testville:stepwell",
          name: "Royal Stepwell",
          category: "heritage" as const,
          location: { lat: 24.581, lon: 73.686 },
          visitMin: 60,
          ticketPerPerson: { amountMinor: 10000, currency: "INR" as const, provenance: "curated_table" as const, sourceUrl: "https://example.org/testville", asOf: "2026-10-01" },
          hours: { rules: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "08:00", close: "18:00" }] },
          stepFree: "unverified" as const,
          outdoor: true,
          vibes: ["romantic" as const, "cultural" as const],
          officialUrl: "https://example.org/stepwell",
          source: "curated" as const,
        },
      ],
    };
    const page = "Welcome to the stepwell. Visitors descend 120 steep steps to reach the water; there is no lift.";
    const tools = fakeTools({
      extract: async () => ({ value: { pages: [{ url: "https://example.org/stepwell", text: page }], failed: [] }, cached: false, credits: 1, summary: "1/1 page(s) extracted" }),
    });
    const draft0 = {
      lodgingId: "testville:hotel-mid",
      mealTier: "mid",
      days: [
        { dayIndex: 0, theme: "Gardens", placeIds: ["testville:garden", "testville:sunset"] },
        { dayIndex: 1, theme: "Heritage", placeIds: ["testville:stepwell", "testville:car-museum"] },
        { dayIndex: 2, theme: "Crafts", placeIds: ["testville:museum"] },
        { dayIndex: 3, theme: "Farewell", placeIds: [] },
      ],
      rationale: "Romantic gardens first, heritage on day two.",
    };
    const draft1 = { ...draft0, days: draft0.days.map((d) => (d.dayIndex === 1 ? { ...d, placeIds: ["testville:lake-boat", "testville:car-museum"] } : d)) };
    const llm = scriptedLlm({
      ...specialists,
      BudgetStrategy: () => ({ lodgingTier: "mid", mealTier: "mid", splitPct: { lodging: 30, food: 20, activities: 10, transport: 30, buffer: 10 }, rationale: "Balanced." }),
      PlannerDraft: (_r, n) => (n === 1 ? draft0 : draft1),
      AccessibilityVerdicts: () => ({ verdicts: [{ targetId: "testville:stepwell", status: "not_step_free", sentenceId: "S1", quote: "Visitors descend 120 steep steps to reach the water; there is no lift." }] }),
      CriticFeedback: () => ({ summary: "The stepwell has 120 steps; take the boat instead.", directives: [{ op: "swap_place", placeId: "testville:stepwell", replacementId: "testville:lake-boat", reason: "Step-free alternative", addresses: ["R6"] }] }),
    });
    const c = collector();
    const res = await runPlan({ runId: "run_t7", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, makeDeps(llm, tools, testConfig(), pack), c.emit, new AbortController().signal);
    expect(res.status).toBe("finalized");
    expect(res.rounds).toBe(1);
    expect(c.events.some((e) => e.type === "tool_call" && e.tool === "tavily.extract")).toBe(true);
    const flag = c.events.find((e) => e.type === "critic_flag");
    expect(flag?.type === "critic_flag" && flag.violation.code).toBe("NOT_STEP_FREE");
    expect(flag?.type === "critic_flag" && flag.violation.itemIds).toContain("testville:stepwell");
    const visit = res.final?.days[1]?.items.find((i) => i.kind === "visit" && i.placeId === "testville:lake-boat");
    expect(visit).toBeDefined();
  });

  it("streams a schema-valid SSE sequence end to end with exactly one done", async () => {
    const llm = scriptedLlm({ ...specialists, PlannerDraft: (_r, n) => (n === 1 ? AMBITIOUS : REPLAN), CriticFeedback: () => CRITIC });
    const deps = makeDeps(llm);
    const response = createSseResponse({
      runId: "run_sse",
      signal: new AbortController().signal,
      run: async (emit, signal) => {
        const r = await runPlan({ runId: "run_sse", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, deps, emit, signal);
        emit({ type: "usage", llmCalls: r.usage.llmCalls, toolCalls: r.usage.toolCalls, tokensIn: r.usage.tokensIn, tokensOut: r.usage.tokensOut, estUsd: r.usage.estUsd, tavilyCredits: r.usage.tavilyCredits, elapsedMs: r.usage.elapsedMs });
        emit({ type: "done", status: r.status });
      },
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    const parsed: SSEEvent[] = [];
    const parser = createParser({ onEvent: (m) => parsed.push(SSEEvent.parse(JSON.parse(m.data))) });
    parser.feed(text);
    expect(parsed.length).toBeGreaterThan(20);
    expect(parsed.filter((e) => e.type === "done")).toHaveLength(1);
    expect(parsed.at(-1)?.type).toBe("done");
    expect(parsed.some((e) => e.type === "error")).toBe(false);
    parsed.forEach((e, i) => expect(e.seq).toBe(i));
  });
});

describe("LLM outage breaker", () => {
  it("stops calling models after 3 outage-type failures and finishes deterministically", async () => {
    const outage = () => new AppError("LLM_SERVER", "network down");
    const llm = scriptedLlm({ MoodProfile: outage, ExplorePlan: outage, BudgetStrategy: outage, PlannerDraft: outage, CriticFeedback: outage });
    const c = collector();
    const res = await runPlan({ runId: "run_t8", request: riyaLikeRequest(), routes, bailOnLlmFatal: false }, makeDeps(llm), c.emit, new AbortController().signal);
    expect(res.status).toBe("finalized");
    expect(llm.calls.some((x) => x.startsWith("PlannerDraft"))).toBe(false);
    expect(c.events.some((e) => e.type === "thinking" && e.text.includes("not responding reliably"))).toBe(true);
  });
});
