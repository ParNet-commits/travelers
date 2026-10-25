---
name: verify-ui
description: Click-through verification of the TravelVerse UI in the browser (desktop and 375 px). Use after any UI change and before every deploy.
---
# Verify the UI like a judge would

Start `npm run dev:api` and `npm run dev`, open http://localhost:5173 in the browser tool, then check:

1. Home loads with no console errors. The Riya preset card is visible above the fold.
2. "Watch the recorded run" (if a golden run exists): the replay banner appears immediately, cannot be dismissed,
   timeline streams, rule grid shows a red round then a green round, final itinerary + map render.
3. "Plan it live" (needs keys): first event within 3 s, agents appear in the timeline, `llm_call` rows show model names,
   budget meter moves, map markers appear per day, Accessibility Audit badge shows sources.
4. Trade-off: run the "impossible budget" case (USD 150). The dialog shows two options with exact amounts;
   choosing one finalizes the plan without a network request.
5. Stop button cancels a live run within 1 s and the UI returns to idle.
6. Errors: stop `dev:api` and start a run - offline replay starts (if recorded) or a clear error message appears.
7. Mobile (375 x 812): no horizontal scroll, tabs Plan / Timeline / Map work, buttons at least 44 px tall.
8. Keyboard: Tab reaches every control in order, focus ring visible, Esc closes dialogs and drawers.
9. Control Room (/control): status loads; deep check rejects a wrong admin token; model dropdowns list the allowlist.

Report each item as PASS/FAIL with a one-line note and a screenshot for every FAIL.
