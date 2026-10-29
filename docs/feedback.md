# Nebius Token Factory — Developer Feedback Report (Part D3)

> **Submission Track:** Most Valuable Feedback  
> **Project:** TravelVerse (Self-Correcting Travel Planning Agent)  
> **Author:** Paras Neta  
> **Date:** 2026-10-29  
> **Target API:** `https://api.tokenfactory.nebius.com/v1`  
> **Models Evaluated:**
> - Fast / Specialist: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`
> - Planner / Critic: `nvidia/nemotron-3-super-120b-a12b`
> - Escalation / Complex Reasoning: `nvidia/Nemotron-3-Ultra-550b-a55b`

---

## 1. Executive Summary & Workload Scope

During the development and testing of TravelVerse, Nebius Token Factory served as the sole LLM inference backend for our multi-agent architecture (Specialist swarm, Master Planner, Critic, and Accessibility Verifier).

### Measured Workload Footprint
- **Total Automated Test Suite Calls:** 12 tests against Nemotron client in Vitest (all passed).
- **Benchmark Sample Size:** 3 iterations per model tier across non-streaming, streaming, and JSON mode (total 27 benchmark probes).
- **Concurrency Test:** 5 concurrent calls tested on `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (5/5 succeeded in 2004 ms wall time; concurrency beyond 5 not verified).
- **10-Case Mini-Evaluation (cost from an earlier 10-case eval):** Total model cost across 10 evaluation plans was **$0.068** (average **$0.0068** per plan). Model failure count: **0** across all 10 runs.
- **Hero Golden Run (`replay/runs/riya.ts`):** 12 LLM calls, 20,930 prompt tokens, 23,722 completion tokens (44,652 total tokens), estimated cost **$0.019823**, completed in 128.084 s with 1 re-plan round.
- **Cold-start container latency:** not measured (not verified).
- **GPU memory / VRAM utilization:** not measured (not verified).
- **Throughput beyond 5 concurrent requests:** not measured (not verified).

---

## 2. Measured Benchmark & Performance Data

All figures below are directly extracted from `bench-report.md` (recorded 2026-10-28T15:38:15.993Z) and `probe-report.json` (recorded 2026-10-27T14:43:29.545Z).

### 2.1 Model Latency, Time to First Token (TTFT), and Throughput
*In our tests (3 samples, short prompts: "In one short sentence: why do travellers love lake cities?", max_tokens: 300).*

| Model | Role | Non-stream p50 | TTFT p50 | Stream total p50 | Output tok/s | JSON mode validity | Errors observed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | fast | 1,429 ms | 273 ms | 936 ms | 187.5 tok/s | 3/3 (100%) | none |
| `nvidia/nemotron-3-super-120b-a12b` | planner | 5,051 ms | 1,637 ms | 2,380 ms | 159.6 tok/s | 3/3 (100%) | none |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | escalation | 568 ms | 552 ms | 690 ms | 314.0 tok/s | 3/3 (100%) | none |

*Key Measurement Finding:* In our tests (3 samples, short prompts), `Nemotron-3-Ultra-550b-a55b` achieved **314.0 output tokens/sec** and a non-streaming latency of **568 ms**, outperforming the 120B model on non-stream latency. Conversely, `nemotron-3-super-120b-a12b` exhibited a high p50 non-stream latency of 5,051 ms and 1,637 ms TTFT.

### 2.2 Concurrency & Tool Calling
- **5 Concurrent Requests (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`):** Wall clock time: **2004 ms**. Result: **5/5 succeeded (100%)** (concurrency beyond 5 not verified).
- **Tool Calling (OpenAI format):** In our test, fast model returned 1 tool call: `get_forecast({"city": "Udaipur"})` (other models and tools not verified).
- **Error Semantics Tested:**
  - Request to unlisted model `nvidia/does-not-exist`: Returns **HTTP 404** (`404 The model nvidia/does-not-exist does not exist.`).
  - Request with `max_tokens: 1`: Returns **HTTP 200** with `finish_reason="length"`.
  - HTTP 429 / 503 behavior and Retry-After header: not verified (no rate limits encountered in our runs).

### 2.3 Structured Output Latency Modes (`probe-report.json`)
*Latency to return valid structured responses across `response_format` configurations:*

| Model | `json_schema` mode | `json_object` mode | Default `none` mode | Valid JSON Output |
| :--- | :--- | :--- | :--- | :--- |
| `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | 442 ms | 380 ms | 524 ms | true (all modes) |
| `nvidia/nemotron-3-super-120b-a12b` | 900 ms | 1,023 ms | 1,129 ms | true (all modes) |
| `nvidia/Nemotron-3-Ultra-550b-a55b` | 614 ms | 716 ms | 487 ms | true (all modes) |

### 2.4 Token Pricing from Programmatic Catalog (`/v1/models?verbose=true`)
- **Nano 30B:** Prompt: $0.06 / Mtok ($0.00000006/tok) | Cache Read: $0.012 / Mtok | Completion: $0.24 / Mtok ($0.00000024/tok).
- **Super 120B:** Prompt: $0.30 / Mtok ($0.00000030/tok) | Cache Read: $0.06 / Mtok | Completion: $0.90 / Mtok ($0.00000090/tok).
- **Ultra 550B:** Prompt: $1.00 / Mtok ($0.00000100/tok) | Cache Read: $0.12 / Mtok | Completion: $3.00 / Mtok ($0.00000300/tok).

---

## 3. Detailed Friction Points, Issues & Exact Repro Steps

The following issues were logged during live development (`docs/feedback-notes.md`). Each issue is accompanied by expected behavior, developer impact, and an exact `curl` command using `$NEBIUS_API_KEY`.

---

### Issue 1: Deliberation Tokens Consume `max_tokens`, Causing Premature Truncation & Silent JSON Failure
- **Area:** Reasoning Models & Token Accounting
- **Timestamp:** 2026-10-28T15:41Z
- **What Happened:** When requesting structured JSON output with a reasonable `max_tokens` budget (e.g. 100–300 tokens), Nemotron's reasoning/thinking tokens consume the entirety of the token limit before generating the final answer. The API returns `finish_reason="length"` with `content=null` or broken JSON syntax.
- **Expected:** Either (a) `max_tokens` applies strictly to visible completion tokens with a separate `max_thinking_tokens` allocation (OpenAI `max_completion_tokens` convention), or (b) the model prioritizes producing the completion payload before exhausting the quota.
- **Developer Impact:** High. JSON generation pipelines fail silently with null content or unparseable JSON, requiring developers to defensively inflate `max_tokens` (increasing latency and cost) or manually disable thinking tokens.
- **Exact Repro Command:**
```bash
curl -s -X POST https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-3-super-120b-a12b",
    "messages": [
      {"role": "user", "content": "Return JSON: {\"city\":\"Udaipur\"}"}
    ],
    "response_format": {"type": "json_object"},
    "max_tokens": 100
  }'
```

---

### Issue 2: `reasoning_effort="none"` Fails to Disable Thinking Tokens
- **Area:** Reasoning Models & OpenAI SDK Compatibility
- **Timestamp:** 2026-10-28T15:42Z
- **What Happened:** Passing the OpenAI-standard parameter `"reasoning_effort": "none"` does not disable reasoning. Instead, it returns `HTTP 200` with `choices[0].message.content = null` and diverts the entire output text into the `reasoning` field. To actually disable thinking, developers must use the undocumented proprietary parameter `chat_template_kwargs: {"enable_thinking": false}`.
- **Expected:** Setting `"reasoning_effort": "none"` should disable reasoning tokens and return output directly in `choices[0].message.content`.
- **Developer Impact:** High. Drop-in OpenAI client code that inspects `message.content` receives `null` and throws `TypeError: Cannot read properties of null`.
- **Exact Repro Command:**
```bash
curl -s -X POST https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    "messages": [
      {"role": "user", "content": "What is 2+2?"}
    ],
    "reasoning_effort": "none"
  }'
```

---

### Issue 3: Inconsistent Model ID Casing and Hyphenation Schemes
- **Area:** Model Catalog & Routing
- **Timestamp:** 2026-10-27T14:43Z
- **What Happened:** Model identifiers lack consistent naming conventions across the same Nemotron-3 family:
  - Nano: `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` (uppercase vendor prefix `NVIDIA-` and title case)
  - Super: `nvidia/nemotron-3-super-120b-a12b` (all lowercase)
  - Ultra: `nvidia/Nemotron-3-Ultra-550b-a55b` (title case without `NVIDIA-` prefix)
  - Other catalog listings mix `3.5` with `3_5`.
  Querying the lowercase equivalent `nvidia/nemotron-3-nano-30b-a3b` returns `HTTP 404 Not Found`.
- **Expected:** Case-insensitive model ID routing or normalized lowercase aliases for all family members.
- **Developer Impact:** Medium. Standard configuration managers and SDK switchers break with 404 errors if exact character casing is not hardcoded.
- **Exact Repro Command:**
```bash
curl -s -X POST https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-3-nano-30b-a3b",
    "messages": [
      {"role": "user", "content": "ping"}
    ]
  }'
```

---

### Issue 4: Redundant Delta Fields (`reasoning` & `reasoning_content`) and Null `delta.content` During Streaming
- **Area:** Streaming SSE & OpenAI SDK Compatibility
- **Timestamp:** 2026-10-28T15:38Z & 15:41Z
- **What Happened:** During streaming, chunks emit both `delta.reasoning` and `delta.reasoning_content` with identical content, while `delta.content` is absent or null for multiple seconds during deliberation.
- **Expected:** Either (a) standardize on a single reasoning field (`delta.reasoning` per OpenRouter/vLLM convention), and (b) clearly document the streaming event cycle for reasoning deltas.
- **Developer Impact:** Medium. Strict TypeScript schemas or Zod event parsers reject chunks with duplicate/unexpected properties. Standard UI streaming clients filtering on `chunk.choices[0].delta.content` display empty or frozen UI until the final conclusion tokens arrive.
- **Exact Repro Command:**
```bash
curl -s -N -X POST https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/nemotron-3-super-120b-a12b",
    "messages": [
      {"role": "user", "content": "Explain lakes in 1 sentence."}
    ],
    "stream": true
  }'
```

---

### Issue 5: Missing Standard Rate-Limit and Retry Headers
- **Area:** Rate Limiting & Production Observability
- **Timestamp:** 2026-10-28T15:39Z
- **What Happened:** HTTP response headers omit `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, and `x-ratelimit-reset-requests`. Behavior under HTTP 429/503 (such as `Retry-After`) was not verified as rate limits were not reached during our test runs.
- **Expected:** Standard rate-limit metadata in response headers to allow multi-agent pipelines to proactively throttle or queue requests.
- **Developer Impact:** Medium. Agent loops cannot pace themselves dynamically and must rely on reactive exponential backoff after encountering a hard `HTTP 429`.
- **Exact Repro Command:**
```bash
curl -s -i -X GET "https://api.tokenfactory.nebius.com/v1/models?verbose=true" \
  -H "Authorization: Bearer $NEBIUS_API_KEY" | grep -i "ratelimit"
```
*(Result: 0 matching headers returned).*

---

### Issue 6: Lack of Programmatic Credit Balance & Spend Monitoring Endpoint
- **Area:** Billing & Usage APIs
- **Timestamp:** 2026-10-28T15:39Z
- **What Happened:** The catalog exposes unit pricing in `/models?verbose=true`, but there is no programmatic `/v1/usage` or `/v1/dashboard/billing` endpoint to inspect remaining credit balance or real-time project spend.
- **Expected:** A programmatic endpoint or response header (e.g. `x-nebius-credit-remaining`) returning the current balance in minor units or USD.
- **Developer Impact:** Medium. Automated budget enforcement layers must maintain client-side token counters and static FX/pricing tables that risk drifting from actual backend billing.
- **Exact Repro Command:**
```bash
curl -s -i -X GET "https://api.tokenfactory.nebius.com/v1/usage" \
  -H "Authorization: Bearer $NEBIUS_API_KEY"
```
*(Result: HTTP 404).*

---

### Issue 7: Incomplete Documentation of `chat_template_kwargs.enable_thinking`
- **Area:** Documentation & Developer Portal
- **Timestamp:** 2026-10-28T15:42Z
- **What Happened:** The proprietary parameter `chat_template_kwargs: {"enable_thinking": false}` is essential for running Nemotron models in standard non-reasoning mode, but is absent from the OpenAPI/Swagger specification and official quickstart guides.
- **Expected:** Prominent documentation explaining how thinking/reasoning modes work, how they impact token consumption, and how to disable them via API parameters.
- **Developer Impact:** Medium. Developers must inspect raw vLLM Jinja templates or community Discord channels to discover the working parameter.
- **Exact Repro Command:**
```bash
curl -s -X POST https://api.tokenfactory.nebius.com/v1/chat/completions \
  -H "Authorization: Bearer $NEBIUS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    "messages": [{"role": "user", "content": "test"}],
    "chat_template_kwargs": {"enable_thinking": false}
  }'
```

---

### Issue 8: Authentication Error Ambiguity (Key ID vs. Secret Bearer Token)
- **Area:** Onboarding & Developer Ergonomics
- **Timestamp:** 2026-10-26T17:44Z
- **What Happened:** Passing the 16-character Key ID (shown in the web dashboard column) rather than the long JWT Bearer secret produces a generic `HTTP 401 "Unable authenticate"`.
- **Expected:** Clear error description such as `"Invalid token format: provided credential appears to be a Key ID rather than a Bearer token"`.
- **Developer Impact:** Low to Medium. Slows down first-time developer setup by 15–30 minutes during onboarding.
- **Exact Repro Command:**
```bash
curl -s -X GET "https://api.tokenfactory.nebius.com/v1/models" \
  -H "Authorization: Bearer tf_key_12345678"
```

---

## 4. Ranked Feature Requests by Developer Impact

Ranked based on measurable developer friction during TravelVerse's multi-agent build:

| Rank | Feature Request | Category | Developer Impact Rationale |
| :---: | :--- | :--- | :--- |
| **1** | **Separate `max_thinking_tokens` Budget** | Reasoning / API | Prevents reasoning models from exhausting the output budget and returning truncated or null JSON in structured generation pipelines. |
| **2** | **Standard Support for `reasoning_effort: "none"`** | Compatibility | Enables seamless drop-in interoperability with the OpenAI SDK ecosystem without requiring proprietary Jinja kwargs. |
| **3** | **Standard Rate-Limit Headers (`x-ratelimit-*`, `Retry-After`)** | Reliability | Allows multi-agent systems with parallel specialist swarms to dynamically schedule requests rather than hitting abrupt HTTP 429 exceptions. |
| **4** | **Case-Insensitive Model Routing & Lowercase Aliases** | Ergonomics | Eliminates fragile case-sensitive model strings (`NVIDIA-Nemotron-3-Nano-30B-A3B` vs `nemotron-3-super-120b-a12b`). |
| **5** | **Programmatic Usage & Balance API (`/v1/usage`)** | Billing & Ops | Allows autonomous agent systems to implement verifiable financial circuit breakers using live balance data rather than client-side estimation. |
| **6** | **Standardize Streaming Delta Reasoning Field** | SDK / Types | Removes duplicate `delta.reasoning` and `delta.reasoning_content` fields to ensure out-of-the-box compatibility with strict TypeScript/Zod schemas. |

---

## 5. What Nebius Got Right (Positive Developer Highlights)

1. **Ultra-550B Performance:** In our tests (3 samples, short prompts), `nvidia/Nemotron-3-Ultra-550b-a55b` demonstrated generation throughput of **314.0 tokens/second** and **568 ms non-stream p50**.
2. **Deterministic JSON Accuracy:** Across all 3 model tiers, `response_format: { type: "json_object" }` scored **3/3 (100%) valid JSON** in our tests (3 samples, short prompts), with zero unparseable syntax errors when provided adequate completion tokens.
3. **Transparent Catalog Pricing:** The `/v1/models?verbose=true` endpoint returns granular per-token prompt, cache, and completion rates directly, enabling automated cost calculators without manual scraping.
4. **Reliable Concurrency:** 5 parallel requests on the Nano model executed cleanly with **100% success in 2004 ms** (concurrency beyond 5 not verified).
