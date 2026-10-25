import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AccessibilityVerdicts, BudgetStrategy, ConditionsTriage, CriticFeedback, ExplorePlan, MoodProfile, PlannerDraft } from "../types/travelverse.js";
import { AppError } from "../server/errors.js";
import { extractJsonCandidates, parseFirstValid, stripThink } from "../server/llm/json.js";
import { createNemotronClient, jsonSchemaOf, resetLlmState } from "../server/llm/nemotron.js";
import { RunBudget } from "../server/runBudget.js";
import { testConfig } from "./fakes.js";

const Mini = z.object({ answer: z.string(), n: z.number().int() });

function chat(content: string, finish = "stop"): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 20 } } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
const status = (code: number, body = "{}") => new Response(body, { status: code });

function fakeFetch(queue: Array<Response | ((body: Record<string, unknown>) => Response)>) {
  const bodies: Array<Record<string, unknown>> = [];
  const impl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push(body);
    const next = queue.shift();
    if (!next) throw new Error("no more fake responses");
    return typeof next === "function" ? next(body) : next;
  };
  return { impl, bodies };
}

const req = { agent: "mood_matcher" as const, role: "fast" as const, system: "sys", user: "usr", schema: Mini, schemaName: "Mini" };
const run = (budget = new RunBudget(testConfig().limits)) => ({ signal: new AbortController().signal, budget, routes: testConfig().models });

describe("JSON extraction", () => {
  it("strips think blocks and detects unterminated reasoning", () => {
    expect(stripThink("<think>a { b }</think>\n{\"x\":1}").text.trim()).toBe('{"x":1}');
    expect(stripThink("<think>still thinking {").unterminated).toBe(true);
    expect(stripThink('{"x":1}').unterminated).toBe(false);
  });
  it("finds balanced objects despite braces inside strings and code fences", () => {
    const c = extractJsonCandidates('Sure!\n```json\n{"a":"x}y","b":{"c":1}}\n```\nAlso {"d":2}');
    expect(c).toEqual([{ a: "x}y", b: { c: 1 } }, { d: 2 }]);
  });
  it("prefers the last valid candidate", () => {
    const r = parseFirstValid('{"answer":"draft","n":"oops"} final: {"answer":"ok","n":3}', Mini);
    expect(r).toEqual({ ok: true, data: { answer: "ok", n: 3 } });
  });
  it("every LLM output schema converts to JSON Schema", () => {
    for (const s of [PlannerDraft, CriticFeedback, MoodProfile, ExplorePlan, BudgetStrategy, ConditionsTriage, AccessibilityVerdicts]) {
      const js = jsonSchemaOf(s) as { type?: string };
      expect(js.type).toBe("object");
    }
  });
});

describe("Nemotron client", () => {
  beforeEach(() => resetLlmState());

  it("parses JSON after a <think> block and reports usage", async () => {
    const f = fakeFetch([chat('<think>The user wants {x}.</think>\n{"answer":"hi","n":1}')]);
    const out = await createNemotronClient(testConfig(), f.impl).callJson(req, run());
    expect(out.data).toEqual({ answer: "hi", n: 1 });
    expect(out.meta.reasoningTokens).toBe(20);
    expect(f.bodies[0]?.response_format).toEqual({ type: "json_object" });
    expect(f.bodies[0]?.reasoning_effort).toBe("low");
  });

  it("downgrades response_format on 400 and remembers it for the model", async () => {
    const f = fakeFetch([status(400, '{"error":"response_format not supported"}'), chat('{"answer":"ok","n":2}'), chat('{"answer":"again","n":3}')]);
    const client = createNemotronClient(testConfig(), f.impl);
    const out = await client.callJson(req, run());
    expect(out.data.n).toBe(2);
    expect(f.bodies[1]?.response_format).toBeUndefined();
    await client.callJson(req, run());
    expect(f.bodies[2]?.response_format).toBeUndefined();
  });

  it("retries once on 429 / 529", async () => {
    const f = fakeFetch([status(529), chat('{"answer":"ok","n":1}')]);
    const out = await createNemotronClient(testConfig(), f.impl).callJson(req, run());
    expect(out.meta.attempts).toBe(2);
  });

  it("repairs a schema-invalid answer once", async () => {
    const f = fakeFetch([chat('{"answer":"ok","n":"two"}'), chat('{"answer":"ok","n":2}')]);
    const out = await createNemotronClient(testConfig(), f.impl).callJson(req, run());
    expect(out.meta.repaired).toBe(true);
    expect(JSON.stringify(f.bodies[1]?.messages ?? [])).toContain("You repair JSON");
  });

  it("retries with lower reasoning effort when the answer was cut off", async () => {
    const f = fakeFetch([chat("<think>long reasoning that never ends", "length"), chat('{"answer":"ok","n":1}')]);
    const out = await createNemotronClient(testConfig(), f.impl).callJson(req, run());
    expect(out.data.n).toBe(1);
    expect(f.bodies[1]?.reasoning_effort).toBe("none");
    expect(Number(f.bodies[1]?.max_tokens)).toBeGreaterThan(Number(f.bodies[0]?.max_tokens));
  });

  it("stops immediately on 402 (credits exhausted)", async () => {
    const f = fakeFetch([status(402)]);
    await expect(createNemotronClient(testConfig(), f.impl).callJson(req, run())).rejects.toMatchObject({ code: "LLM_QUOTA" });
    expect(f.bodies).toHaveLength(1);
  });

  it("falls back to the next model when the first is missing (404)", async () => {
    const f = fakeFetch([status(404), chat('{"answer":"ok","n":1}')]);
    const out = await createNemotronClient(testConfig(), f.impl).callJson(req, run());
    expect(f.bodies[1]?.model).toBe(testConfig().models.planner);
    expect(out.meta.fallbackFrom).toBe(testConfig().models.fast);
  });

  it("enforces the per-run LLM call cap before sending", async () => {
    const budget = new RunBudget({ ...testConfig().limits, maxLlmCalls: 1 });
    const f = fakeFetch([chat('{"answer":"bad"}'), chat('{"answer":"ok","n":1}')]);
    await expect(createNemotronClient(testConfig(), f.impl).callJson(req, run(budget))).rejects.toBeInstanceOf(AppError);
    expect(f.bodies).toHaveLength(1);
  });
});
