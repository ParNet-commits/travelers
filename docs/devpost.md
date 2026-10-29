# TravelVerse — Devpost Submission

> **Nebius x NVIDIA Hackathon: Best Apps & Agents Track**  
> *Self-correcting, verifiable travel planning powered by NVIDIA Nemotron on Nebius Token Factory.*

---

## 💡 Elevator Pitch

TravelVerse is a self-correcting travel-planning multi-agent system that pairs NVIDIA Nemotron models on Nebius Token Factory with a pure deterministic physics & mathematics engine. When planning high-stakes trips—such as a 4-day, $900 anniversary trip to Udaipur for parents where the father cannot climb stairs—TravelVerse guarantees real-world feasibility: LLMs propose, deterministic code computes, an autonomous Critic catches constraint violations, Tavily extracts accessibility proof from primary web sources, and human travelers make informed trade-offs when rules conflict.

---

## 🎯 Inspiration

Most AI travel planners are glorified text generators: they enthusiastically recommend hotels that exceed the budget, itineraries with impossible travel times between attractions, and historic venues with steep flights of stairs to mobility-impaired elders.

We built TravelVerse around a real persona: **Riya**, an engineer planning her parents' 30th wedding anniversary in Udaipur. Her constraints are non-negotiable:
1. **Fixed Budget:** USD $900 all-inclusive (lodging, dining, attractions, and local transit).
2. **Mobility Constraint:** Her father suffered a knee injury and strictly cannot climb stairs (step-free access or wheelchair ramps are required).
3. **Experience:** A romantic, balanced 4-day anniversary trip that honors both parents.

Existing LLM tools fail Riya: they hallucinatory claim ancient forts are "fully accessible" or calculate fake hotel totals using outdated averages. TravelVerse was built to bridge the gap between creative AI reasoning and unshakeable deterministic truth.

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
│     - OSRM route & walking calculation                 │
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
5. **Accessibility Proof Engine (Tavily Extract + Nemotron Nano):** Fetches official venue pages, extracts accessibility statements, passes them through a Nano 30B judge, and performs exact-text quote verification: the quote must appear on the fetched official page.
6. **Human-in-the-Loop Trade-Off:** If a budget is mathematically impossible ($150 for 4 days in a luxury destination), TravelVerse does not hallucinate fake prices; it pauses the SSE stream and asks the user to choose between explicit options (e.g., shorten trip or increase budget).

---

## 🚀 Nebius Token Factory & NVIDIA Nemotron Integration

We deployed a tiered model hierarchy on Nebius Token Factory:
- **Fast Tier (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`):** 187.5 tok/s, 273 ms TTFT. Powers the parallel specialists, live summary streams, and accessibility claim verification.
- **Planner/Critic Tier (`nvidia/nemotron-3-super-120b-a12b`):** 159.6 tok/s, 1637 ms TTFT. Handles multi-day logical structuring and constraint critique.
- **Escalation Tier (`nvidia/Nemotron-3-Ultra-550b-a55b`):** 314.0 tok/s, 552 ms TTFT. Remarkable speed and deep reasoning when resolving complex multi-constraint re-plans.

### Developer Experience Highlights
- **Cost Efficiency:** Average cost per full plan across all agent calls was **$0.0068** (< 1 cent!), with the complex 3-round Riya hero plan totaling just **$0.0465**.
- **Reliability:** Built-in exponential backoff retry ladders for transient 429/529 errors.
- **Thinking Token Management:** Discovered and handled reasoning token consumption under strict `max_tokens` constraints (documented in `docs/feedback-notes.md`).

---

## 🛡️ Reliability, Safety & Production Hardening

- **65 Passing Automated Tests:** Vitest suites covering the deterministic engine, R0–R8 rules, LLM fallback ladder, security sanitization, and UI state reducer.
- **Zero Secret Leaks:** Built-in pre-commit and CI scanner (`scripts/check-secrets.mjs`) guarantees no API keys or tokens are ever packaged in client bundles or committed to git.
- **Deterministic Bounds:** Every plan execution is capped at max 3 re-plans, 16 LLM calls, 20 tool calls, 160,000 tokens, $0.10 USD spend, and a 240-second timeout.
- **Prompt Injection Defense:** External search data and map strings are sanitized, scanned with regex heuristic filters, and encapsulated in untrusted XML wrappers before entering prompts.
- **Control Room:** An administrative dashboard (`/control`) providing real-time telemetry on budget spend, breaker trips, model switches, and manual overrides.

---

## 👥 Team & Acknowledgments

Built by **Paras Neta** for the **Nebius x NVIDIA Hackathon (2026)**.  
Open-sourced under the [MIT License](../LICENSE).
