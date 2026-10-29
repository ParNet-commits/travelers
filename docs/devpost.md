# TravelVerse — Devpost Submission (Part D2)

> **Track:** Nebius x NVIDIA Hackathon: Best Apps & Agents Track  
> **Tagline:** Self-correcting multi-agent travel planner pairing NVIDIA Nemotron on Nebius Token Factory with a deterministic constraints & finance engine.

---

## 💡 Elevator Pitch

TravelVerse is a self-correcting travel-planning multi-agent system that pairs NVIDIA Nemotron models on Nebius Token Factory with a deterministic rules & financial engine. When planning high-stakes trips—such as a 4-day, $900 anniversary trip to Udaipur for parents where the father cannot climb stairs—TravelVerse checks real-world feasibility: LLMs propose semantic selections, deterministic code computes financial arithmetic and transit feasibility, an autonomous Critic catches constraint violations, Tavily extracts accessibility proof from primary web sources, and human travelers make informed trade-offs when rules conflict.

---

## 🎯 Inspiration

Most AI travel planners are text generators that can recommend hotels exceeding the budget, itineraries with unrealistic travel times between attractions, or historic venues with steep flights of stairs to mobility-impaired elders.

We built TravelVerse around a real persona: **Riya**, planning her parents' 30th wedding anniversary in Udaipur. Her constraints are non-negotiable:
1. **Fixed Budget:** USD $900 all-inclusive (lodging, dining, attractions, and local transit).
2. **Mobility Constraint:** Her father cannot manage stairs (step-free access or wheelchair ramps are required).
3. **Experience:** A romantic, balanced 4-day anniversary trip that honors both parents.

Existing LLM tools fail Riya: they can claim ancient forts are "fully accessible" or calculate inaccurate hotel totals using outdated averages. TravelVerse was built to bridge the gap between creative AI reasoning and deterministic verification.

---

## ⚙️ How It Works: The Self-Correcting Loop

TravelVerse operates on a core architectural maxim: **"LLM decides, code computes."**

```
┌────────────────────────────────────────────────────────┐
│  1. Specialized Research Agents (Nemotron-3 Nano 30B)  │
│     - Mood & Tone Specialist                           │
│     - Explorer & Venues Specialist                     │
│     - Weather & Conditions Specialist                  │
│     - Budget Allocation Specialist                     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  2. Master Planner (Nemotron-3 Super 120B / Ultra 550B)│
│     - Generates structured day-by-day itinerary draft  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│  3. Deterministic Engine (Pure TypeScript)             │
│     - Real money arithmetic (integer minor units)      │
│     - OSRM road distance matrix (driving) & transit    │
│     - Verification of 9 Core Rules (R0 - R8)           │
└───────────────────────────┬────────────────────────────┘
                            │
                 ┌──────────┴──────────┐
                 │ Rules Passed?       │
                 └────┬───────────┬────┘
                  YES │           │ NO (Violations found)
                      ▼           ▼
       ┌────────────────┐   ┌────────────────────────────────────────┐
       │ 4. Tavily Proof│   │ 5. Critic Agent (Super 120B / Ultra)   │
       │    Pipeline    │   │    - Analyzes violations               │
       │    (Extract +  │   │    - Re-plans draft (max 3 rounds)     │
       │     Nano Judge)│   │    - If unsolvable: triggers Human     │
       └───────┬────────┘   │      Trade-Off Decision                │
               │            └───────────────────┬────────────────────┘
               ▼                                │
┌────────────────────────────────┐              │
│ 6. Verified Itinerary Output   │◄─────────────┘
│    - Timeline & Step-Free Map  │
│    - Audited Budget & Proofs   │
└────────────────────────────────┘
```

1. **Specialist Swarm (Nemotron-3 Nano 30B):** Four lightweight agents analyze the prompt in parallel, synthesizing traveler mood, seasonal weather from Open-Meteo, curated city pack locations, and fiscal bounds.
2. **Strategic Planner (Nemotron-3 Super 120B):** Assembles a coherent draft in JSON mode, specifying places, meal types, and transit choices.
3. **Deterministic Rules Engine (R0–R8):** Validates every constraint mathematically in zero milliseconds:
   - **R0 Data:** All activity IDs are valid, duplicate stops are removed, no days are empty, and costs have verified provenance.
   - **R1 Budget:** Total integer cost in minor units (cents/paise) must not exceed the user's budget ceiling.
   - **R2 Hours:** Every stop is open during its scheduled visit window on that day of the week, with no active closure advisories.
   - **R3 Walking:** Daily walking distance stays within the traveler's mobility limit or pace default threshold.
   - **R4 Transit:** Daily transit travel time stays within the allowable pace limit.
   - **R5 Weather:** Checks forecast for rain probability (≥40%) or midday heat (≥34°C) during outdoor visits.
   - **R6 Step-free:** Lodging and all scheduled stops must have verified step-free access when mobility constraints are required.
   - **R7 Day length:** Daily stop count stays within pace limits and activities end before the evening cutoff.
   - **R8 Rest:** Ensures regular rest breaks between activity blocks on relaxed or step-free trips.
4. **Critic & Repair:** When rules fail (e.g., City Palace has steep stairs), the engine first attempts mathematical repair (`repairToFit`). If structural re-planning is required, the Critic constructs structured feedback and triggers a re-plan. If a round reaches escalation, it upgrades to Nemotron-3 Ultra 550B.
5. **Accessibility Proof Engine (Tavily Extract + Nemotron Nano):** Fetches official venue pages, extracts accessibility statements, passes them through a Nano 30B judge, and performs exact-text quote verification: the quote must appear on the fetched official page (`verifyVerbatimQuote`).
6. **Human-in-the-Loop Trade-Off:** If a budget is mathematically impossible ($150 for 4 days in a luxury destination), TravelVerse does not hallucinate fake prices; it pauses the SSE stream and asks the user to choose between explicit options (e.g., shorten trip or increase budget).

---

## 📊 Measured System Performance & Real Numbers

All metrics below are drawn strictly from measured data in the repository (`eval-report.md`, `bench-report.md`, `replay/runs/riya.ts`, and test suite runs):

- **Automated Test Count:** **65 passing automated tests** across 9 test files in Vitest (100% pass rate covering engine, R0-R8 rules, repair, LLM client retry ladder, fetch armor, and UI reducers).
- **Cost Per Plan (from an earlier 10-case eval):**
  - Average model cost across all 10 evaluation plans: **$0.0068 per plan** (total $0.068 for all 10 runs).
  - Golden Hero Plan (4-day, multi-round with 1 re-plan and 12 LLM calls): **$0.019823 (~$0.02)**.
- **Latency & Throughput (in our tests: 3 samples, short prompts):**
  - Evaluation latency p50: **27.8 seconds** (max: 186.8 seconds for multi-round re-planning).
  - Golden Hero live run elapsed wall time: **128.084 seconds** (128.1 s for 12 LLM calls, 6 tool calls, and Tavily extraction).
  - Fast Tier (`Nemotron-3-Nano-30B`): **273 ms TTFT p50**, **1,429 ms non-stream p50**, **187.5 tokens/sec**.
  - Planner Tier (`nemotron-3-super-120b`): **1,637 ms TTFT p50**, **5,051 ms non-stream p50**, **159.6 tokens/sec**.
  - Escalation Tier (`Nemotron-3-Ultra-550b`): **552 ms TTFT p50**, **568 ms non-stream p50**, **314.0 tokens/sec**.
- **Tavily Credits Usage:**
  - **3 Tavily credits per plan** consumed during the Golden Hero run (well within the 10 credit hard budget ceiling).
- **Concurrency & Reliability:**
  - 5 concurrent requests on Nano 30B: **5/5 succeeded (100%)** in **2004 ms** (concurrency beyond 5 not verified).
  - Secret scan: **0 leaks across 118 files** (`scripts/check-secrets.mjs`).

---

## 🛠️ Built During the Submission Period (Git Log Audit)

Built during the hackathon starting from a starter kit (engine core, contracts, tests) prepared with AI assistance between **October 25, 2026** and **October 29, 2026**, as reflected in the git history:

- **2026-10-25 (`f9d9bc7`):** Scaffolded project with TypeScript strict mode, Zod contract schemas (`types/travelverse.ts`), pure deterministic engine (`server/engine/*`), R0–R8 verification rules, deterministic repair, Server-Sent Events (SSE) streaming infrastructure, prompt injection security wrappers, and initial Vitest test suite.
- **2026-10-26 (`c9e7af1`):** Repository hygiene, CI configuration, and ignore patterns.
- **2026-10-27 (`dd09e87`, `ca5d5c0`, `5840ea9`):** Researched and implemented Udaipur Curated City Pack (14 venues, 6 lodgings, 19 verified official domains, integer pricing, and accessibility tags); built the Tavily Extract + Nemotron Nano accessibility proof verification pipeline.
- **2026-10-28 (`9bee74c`, `922737c`, `49007c5`, `ddedcab`, `901d918`):** Integrated Nebius Token Factory with tiered NVIDIA Nemotron-3 models (Nano 30B, Super 120B, Ultra 550B); recorded the live Golden Hero run for Riya's Udaipur anniversary (`replay/runs/riya.ts`); built the benchmarking and probe test harness; initialized the Vite + React 19 frontend with Tailwind v4 design tokens; implemented the Trip Request and Presets selector.
- **2026-10-29 (`7d9fee8`, `4b1fed6`, `6a5beb4`, `3d9d9f9`, `69ac3ff`, `3755cc8`, `fea1043`, `707f7ce`):** Built the real-time Agent SSE Timeline with thinking-state streams; created the day-by-day Itinerary view; integrated Leaflet mapping with step-free pins and walking routes; built the Deterministic Budget Breakdown and R0–R8 Verification Grid; implemented the Critic Diagnostics visualizer and Human-in-the-Loop Decision modal; conducted 375px mobile responsive audit; built the `/control` Telemetry Room; deployed production release to Vercel; and authored the developer feedback and Devpost reports.

---

## 🧰 Built With

- **AI & Models:** NVIDIA Nemotron-3 Nano 30B (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`), NVIDIA Nemotron-3 Super 120B (`nvidia/nemotron-3-super-120b-a12b`), NVIDIA Nemotron-3 Ultra 550B (`nvidia/Nemotron-3-Ultra-550b-a55b`).
- **Inference Platform:** Nebius Token Factory (`https://api.tokenfactory.nebius.com/v1`).
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4 design tokens, Leaflet / React-Leaflet.
- **Backend & Engine:** Node.js, Vercel Serverless Functions, Server-Sent Events (SSE), Pure Deterministic Math Engine (Integer minor money, OSRM distance, R0–R8 rules).
- **APIs & Tools:** Tavily Search & Extract API (official venue accessibility proofs), Open-Meteo (hourly temperature and precipitation forecasts), OSRM (road distance matrix, driving profile).
- **Validation & Security:** Zod contract validation, Prompt-injection heuristic sanitizer, Verbatim quote verification.
- **Testing & Tooling:** Vitest (65 automated unit and integration tests), Oxlint, custom secret leakage scanner.

---

## 🔗 Try It Out & Links

- 🌐 **Live Web Application:** [https://travelers-taupe.vercel.app](https://travelers-taupe.vercel.app)
- 🛠️ **Administrative Control Room:** [https://travelers-taupe.vercel.app/control](https://travelers-taupe.vercel.app/control)
- 💻 **GitHub Repository:** [https://github.com/ParNet-commits/travelers](https://github.com/ParNet-commits/travelers)
- 📺 **3-Minute Video Walkthrough:** VIDEO_LINK_TBD
- 📄 **Developer Feedback Report:** [`docs/feedback.md`](./feedback.md)

