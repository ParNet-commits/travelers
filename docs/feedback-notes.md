# Token Factory developer-experience log (fill as you build)

Write one line the moment something surprises you. These notes become the "Most Valuable Feedback" report.
Format: date/time | area | what happened | expected | impact | repro (command or request)

## Onboarding and keys
- 2026-10-26T17:44Z | Onboarding and keys | Passing 16-char Key ID instead of Bearer token returned HTTP 401 "Unable authenticate" | Differentiate Key ID vs secret token in error message or console | Live inference blocked until valid JWT Bearer key is provided | npm run probe:models

## Model catalog and ids
- 2026-10-27T14:43Z | Model catalog and ids | Inconsistent casing across family: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B' vs 'nvidia/nemotron-3-super-120b-a12b' vs 'nvidia/Nemotron-3-Ultra-550b-a55b' plus '3_5' vs '3.5' delimiter shifts | Normalized lowercase ids or case-insensitive matching in router | Case mismatches return HTTP 404 ('model does not exist'), breaking standard SDK configs | curl https://api.tokenfactory.nebius.com/v1/chat/completions -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"nvidia/nemotron-3-nano-30b-a3b","messages":[{"role":"user","content":"ping"}]}'

## OpenAI SDK compatibility (chat.completions, streaming, response_format, tools)
- 2026-10-28T15:38Z | OpenAI SDK compatibility | SSE chunks stream delta.reasoning and delta.reasoning_content while delta.content is absent/null during reasoning | Either stream reasoning into standard thinking blocks or document dual-field delta schema | Standard OpenAI SDK consumers filtering on chunk.choices[0].delta.content experience multi-second UI freezes before any text arrives | curl https://api.tokenfactory.nebius.com/v1/chat/completions -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"Explain lakes in 1 sentence."}],"stream":true}'
- 2026-10-28T15:41Z | OpenAI SDK compatibility | Duplicated delta fields ('reasoning' and 'reasoning_content') in streaming chunks deviate from strict OpenAI ChatCompletionChunk types | A single standardized reasoning field adhering to OpenAI / OpenRouter conventions | Typescript SDK and strict Zod parsers reject unexpected or redundant properties unless schemas are relaxed | curl https://api.tokenfactory.nebius.com/v1/chat/completions -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"hi"}],"stream":true}'

## Reasoning models (reasoning_effort, <think> blocks, token usage)
- 2026-10-28T15:42Z | Reasoning models | Passing OpenAI-standard reasoning_effort="none" returns HTTP 200 with content=null and puts entire response into reasoning field; turning off thinking requires proprietary chat_template_kwargs.enable_thinking=false | reasoning_effort="none" should suppress reasoning tokens and place response in message.content | Drop-in OpenAI code checking choices[0].message.content receives null and throws TypeError | curl https://api.tokenfactory.nebius.com/v1/chat/completions -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B","messages":[{"role":"user","content":"What is 2+2?"}],"reasoning_effort":"none"}'
- 2026-10-28T15:41Z | Reasoning models | Reasoning tokens consume max_tokens allocation; with moderate max_tokens (e.g. 300) deliberation consumes all tokens, triggering finish_reason="length" and returning content=null | Support separate max_completion_tokens / thinking budget, or prioritize completion output | JSON mode and structured generation fail silently without generating valid JSON object | curl https://api.tokenfactory.nebius.com/v1/chat/completions -H "Authorization: Bearer $NEBIUS_API_KEY" -H "Content-Type: application/json" -d '{"model":"nvidia/nemotron-3-super-120b-a12b","messages":[{"role":"user","content":"Return JSON: {\"city\":\"Udaipur\"}"}],"response_format":{"type":"json_object"},"max_tokens":100}'

## Errors, limits, retries (status codes, messages, rate limits, Retry-After)
- 2026-10-28T15:39Z | Errors, limits, retries | Responses lack standard rate-limit headers (x-ratelimit-limit-requests, x-ratelimit-remaining-requests, x-ratelimit-reset-requests, retry-after) | Standard x-ratelimit-* headers and Retry-After header on 429/503 | Clients cannot proactively schedule or throttle agent calls before hitting hard 429 failures | curl -i https://api.tokenfactory.nebius.com/v1/models?verbose=true -H "Authorization: Bearer $NEBIUS_API_KEY"

## Latency and throughput (link to bench-report.md)
- 2026-10-28T15:38Z | Latency and throughput | Super-120b model exhibits 5051 ms non-stream p50 and 1637 ms TTFT vs Ultra-550b at 568 ms non-stream and 552 ms TTFT (314 tok/s) | Predictable latency scaling across model parameter tiers | Multi-agent pipelines experience 5s+ pauses on planner agent turns while escalation agent is 9x faster | npm run bench

## Docs and examples
- 2026-10-28T15:42Z | Docs and examples | Parameter chat_template_kwargs.enable_thinking is not documented in standard API docs or Swagger schema | Clear documentation of proprietary parameters and how to disable/control Nemotron thinking | Developers must reverse-engineer vLLM chat templates to discover how to turn off reasoning tokens | curl https://api.tokenfactory.nebius.com/v1/models?verbose=true -H "Authorization: Bearer $NEBIUS_API_KEY"

## Billing and spend visibility
- 2026-10-28T15:39Z | Billing and spend visibility | Token Factory provides pricing in /models?verbose=true but no programmatic credit/spend check endpoint (/v1/dashboard/billing or /v1/usage) | An endpoint or response header indicating remaining credits or dollar spend | Automated cost guards must maintain client-side token math and FX lookup tables that risk desync | curl https://api.tokenfactory.nebius.com/v1/models?verbose=true -H "Authorization: Bearer $NEBIUS_API_KEY"

