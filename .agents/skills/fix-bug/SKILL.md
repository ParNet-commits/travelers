---
name: fix-bug
description: Systematic debugging for TravelVerse. Use when a test, build, deploy, live run or UI behaviour fails and the cause is not obvious.
---
# Fix a bug without making two new ones

1. Reproduce first. Get the exact failing command or click path and the full error text. If you cannot
   reproduce it, say so and ask for the missing detail instead of guessing.
2. Classify the failure (it decides where to look):
   - Type error -> the file and the contract in `types/travelverse.ts` it touches.
   - Zod error ("unexpected shape at ...") -> the raw response vs. the schema; the schema path is in the message.
   - SSE/stream problem -> `server/sse/sse.ts`, `src/lib/sseClient.ts`, headers, `vercel.json`.
   - LLM output problem -> `llm_call` events (note field), `server/llm/nemotron.ts`, the prompt in `server/llm/prompts.ts`.
   - Wrong number in the UI -> engine (`server/engine/*`) - never "fix" numbers in the UI.
   - Works locally, fails on Vercel -> missing `.js` import extension, env var not set, function timeout, region.
3. Write a failing test that captures the bug (vitest in `tests/`), unless it is pure styling.
4. Make the smallest fix. Respect AGENTS.md golden rules (no casts on external data, no weakened schemas or caps).
5. Run `npm run typecheck && npm test`. Then re-run the original reproduction.
6. If the same error survives two attempts: stop, list what you tried, paste the exact error, give your best hypothesis.
7. Report: root cause in one sentence, files changed, test added, verification output.
