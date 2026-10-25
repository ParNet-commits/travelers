---
name: review-diff
description: Review the current changes against TravelVerse's golden rules before committing or deploying.
---
# Review the diff

Run `git diff` (and `git diff --staged`). For every changed file answer:
1. Does any LLM output now carry a number, price, time or total? (must not)
2. Is any external data (API response, LLM output, request body, SSE event) used without Zod validation?
3. Any `any`, `@ts-ignore`, non-null `!` on external data, or `as` cast on external data?
4. Any HTTP call not going through `fetchJson` or `llmJson`? Any loop/retry without a cap?
5. Any web/map text reaching a prompt without sanitize + detectInjection + wrapUntrusted?
6. Any secret, key, token or `.env*` content in code, logs, client bundle, or a `VITE_` variable?
7. Relative imports without `.js`? Contract changes without updated tests?
8. User-visible numbers not coming from engine output? Missing "Estimated" label or replay banner?
9. Accessibility: color-only status, missing labels, focus traps?
Then run `npm run check`. Output: a table (file, issue, severity, fix) and a final GO / NO-GO.
