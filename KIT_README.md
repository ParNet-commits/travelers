# TravelVerse Core Kit

Verified backend, contracts, tests, scripts and agent rules for the TravelVerse hackathon build.
Apply it with prompt P01 in "TravelVerse_Solo_Build_Kit.docx" (Part B).

## Status when packaged (17 Oct 2026)
- TypeScript 6.0 strict (server: NodeNext; client: Vite bundler), `erasableSyntaxOnly`, `verbatimModuleSyntax`.
- 54 vitest tests passing (engine, rules, repair/trade-off, agent loop end to end with scripted models, SSE stream,
  LLM client reliability ladder, fetch armor, prompt-injection defence, Tavily proof pipeline, client reducer/parser).
- oxlint clean. Rehearsed in a fresh `npm create vite@latest -- --template react-ts` project: install, typecheck,
  tests, lint, secret scan and build all green; local API server streamed a full run end to end.

## What is NOT included (you create it with the prompts)
- `server/data/cities/udaipur.places.ts` and `udaipur.ts` (sourced data, P03-P04).
- `replay/runs/riya.ts` content (a real recording, P07). The placeholder exports `null`.
- The React UI components (P11-P17). `src/hooks`, `src/lib` are included.

## Files
- `package.kit.json` -> rename to `package.json` (exact versions + scripts).
- `AGENTS.md`, `.agents/skills/*` -> Antigravity rules and skills.
- `api/` Vercel functions, `server/` backend, `types/` contracts, `replay/` presets + golden runs,
  `scripts/` tooling, `tests/` vitest, `docs/feedback-notes.md` DX log.
