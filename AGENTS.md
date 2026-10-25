# AGENTS.md - TravelVerse (read before every task)

TravelVerse is a self-correcting travel-planning agent for the Nebius x NVIDIA hackathon (Best Apps & Agents).
Nemotron models on Nebius Token Factory plan; deterministic TypeScript computes and checks; a Critic fixes what fails;
a human decides when rules cannot all be met. Hero demo: Riya plans her parents' 30th anniversary in Udaipur,
USD 900, 4 days, father cannot climb stairs.

## Golden rules (never break these)
1. LLM decides, code computes. Models output ONLY ids, enums, short text and a few range-checked decision numbers
   (day index, search radius, % split for display). Every price, time, distance, total and pass/fail comes from
   `server/engine/*`. Never add a price/time/distance/total field to an LLM output schema.
2. Money = integer minor units (cents, paise) with provenance (`PricedAmount`). Never floats for money. Use
   `server/engine/money.ts` (convertMinor, sumMinor, formatMoney). Never hard-code an FX rate outside `server/data/fx.ts`.
3. Zod everywhere. Every API body, tool response, LLM output and SSE event is validated with the schemas in
   `types/travelverse.ts`. No `any`, no `@ts-ignore`, no `as` casts on external data (use `.parse`/`.safeParse`).
4. One door per dependency. Non-LLM HTTP only via `server/http/fetchJson.ts` (timeout, retry, breaker, cache).
   LLM calls only via `llmJson()` in `server/agents/common.ts` (which uses `server/llm/nemotron.ts`).
5. Web and map text is untrusted. Sanitize with `sanitizeExternalText`, drop it if `detectInjection` flags it,
   wrap it with `wrapUntrusted` before it enters a prompt. A quote shown to users must pass `verifyVerbatimQuote`.
6. Secrets live only in env vars, read only in `server/config.ts`. Never `VITE_` + secret. Never log keys, prompts
   or raw web content. Run `npm run check:secrets` before every commit and deploy.
7. Every LLM step has a deterministic fallback. A model failure must never crash a run; `runPlan` never throws.
8. Everything is bounded: max 3 re-plans, `RunBudget` caps (LLM calls, tool calls, tokens, USD, Tavily credits,
   240 s deadline). Never add a loop or retry without a cap.
9. Replays are always announced (`replay_notice` + a banner that cannot be dismissed). Never present a replay as
   live. `replay/runs/*.ts` is written ONLY by `npm run record:golden` - never edit it by hand.
10. ESM: every relative import ends in `.js` (server AND client). Vercel functions crash on extensionless imports.
11. Contracts change additively. If you must change `types/travelverse.ts`, update every user and the tests in
    the same change, and re-record the golden run.

## Map of the repo
- `types/travelverse.ts` - all Zod contracts (shared by client and server). Single source of truth.
- `api/plan.ts` - POST, SSE stream. `api/health.ts` - Control Room status (+ `?deep=1` admin checks).
- `server/orchestrator/runPlan.ts` - the agent loop (state machine). `server/orchestrator/context.ts` - builds PlanningContext.
- `server/agents/` - specialists (Mood, Explorer, Conditions, Budget), Planner + Critic, shared `llmJson`/`withTool`.
- `server/engine/` - pure deterministic engine: money, time, schedule, budget, rules (R0-R8), repair, trade-off.
- `server/tavily/accessibilityProof.ts` - Tavily Extract -> Nano judge -> verbatim verification -> Evidence.
- `server/tools/` - Nominatim, Overpass, OSRM, Open-Meteo, Tavily wrappers. `server/llm/` - client, prompts, JSON parsing.
- `server/security/` - untrusted-content defence, rate limit. `server/sse/sse.ts` - SSE transport.
- `server/data/` - curated city packs (`cities/*.ts`) and `fx.ts`. `replay/` - golden runs + presets (isomorphic).
- `src/` - React app. `src/lib/sseClient.ts` + `src/lib/agentReducer.ts` + `src/hooks/useAgentStream.ts` own all run state.
- `scripts/` - dev API server, checks, probes, golden recorder, benchmark, eval. `tests/` - vitest.

## Commands
- `npm run dev:api` (terminal 1, API on :8787) + `npm run dev` (terminal 2, Vite proxies /api).
- `npm run typecheck` | `npm test` | `npm run lint` | `npm run check` (typecheck + test + data + secrets).
- `npm run check:data` | `npm run check:secrets` | `npm run smoke:tools` | `npm run probe:models`.
- `npm run record:golden` (real live run -> replay) | `npm run bench` | `npm run eval` | `npm run build`.

## Code style
- TypeScript strict. `erasableSyntaxOnly`: no enums, namespaces or constructor parameter properties.
  `verbatimModuleSyntax`: use `import type` for types. Named exports (React components may default-export).
- Engine code is pure: no I/O, no Date.now(), no randomness. Inject time via `deps.now()/today()`.
- Small files, small functions, early returns. Comments explain WHY, not what.
- UI: React 19 + Tailwind v4 tokens from `src/index.css`. No new UI or state libraries without asking.
  Every status is shown with text or an icon, never color alone. Timeline uses `aria-live="polite"`.
- Errors: throw `AppError` (server/errors.ts) with a code; show users `publicMessage(err)`, never stack traces.

## How to work (agent protocol)
1. Read the files named in the task and this file before editing. Restate the plan in 3-6 bullets.
2. Make the smallest change that satisfies the task. Do not refactor unrelated code. Do not rename files.
3. After every change run `npm run typecheck && npm test`. Fix failures you caused before continuing.
4. Never weaken a test, a lint rule, a schema or a cap to make something pass. Never delete tests.
5. Ask before adding a dependency, changing a contract, or touching `api/`, `server/engine/` or `server/llm/prompts.ts`
   when the task did not mention them.
6. If the same error survives two fix attempts, STOP and report: what you tried, the exact error, your best hypothesis.
7. Finish with: files changed, commands run with their results, anything left undone, and how to verify in the browser.

## Definition of done (every task)
- typecheck, tests, check:secrets green; no new `any`/casts on external data; no console noise in the browser.
- User-visible numbers come from engine output; estimates are labelled "Estimated"; replays show the banner.
- Works at 375 px wide and on desktop; keyboard reachable; no layout shift while streaming.

## Safety settings in Antigravity
- Use "Request Review" (or Default) for terminal commands. Never use Turbo/"Always Proceed".
- Deny any command that prints, uploads or copies `.env.local`, or sends keys to a URL.
- The agent must never run `vercel env pull` into a tracked file or commit `.env*` files.
