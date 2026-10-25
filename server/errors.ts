/** Typed error taxonomy. Every thrown error in server code is an AppError (or converted with toAppError). */

export const ERROR_CODES = [
  "CONFIG_INVALID",
  "LIVE_DISABLED",
  "INPUT_INVALID",
  "RATE_LIMITED_CLIENT",
  "LLM_AUTH",
  "LLM_QUOTA",
  "LLM_RATE_LIMIT",
  "LLM_OVERLOADED",
  "LLM_SERVER",
  "LLM_BAD_REQUEST",
  "LLM_MODEL_NOT_FOUND",
  "LLM_TIMEOUT",
  "LLM_SCHEMA",
  "LLM_REFUSAL",
  "TOOL_AUTH",
  "TOOL_QUOTA",
  "TOOL_RATE_LIMIT",
  "TOOL_TIMEOUT",
  "TOOL_UPSTREAM",
  "TOOL_BAD_RESPONSE",
  "TOOL_NETWORK",
  "CIRCUIT_OPEN",
  "BUDGET_EXCEEDED",
  "DEADLINE",
  "ABORTED",
  "NOT_FOUND",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Errors after which live LLM work is pointless for this run (replay or deterministic path instead). */
const FATAL_FOR_LIVE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(["LLM_AUTH", "LLM_QUOTA", "CONFIG_INVALID", "LIVE_DISABLED"]);

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, opts: { status?: number; retryable?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = opts.status ?? null;
    this.retryable = opts.retryable ?? false;
  }

  get fatalForLive(): boolean {
    return FATAL_FOR_LIVE.has(this.code);
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof AppError && err.code === "ABORTED") ||
    (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

export function toAppError(err: unknown, fallback: ErrorCode = "INTERNAL"): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    if (err.name === "AbortError") return new AppError("ABORTED", "Operation aborted", { cause: err });
    if (err.name === "TimeoutError") return new AppError("TOOL_TIMEOUT", "Operation timed out", { cause: err });
    return new AppError(fallback, err.message.slice(0, 300), { cause: err });
  }
  return new AppError(fallback, "Unknown error");
}

/** Short, user-safe message (never includes secrets, URLs with keys, or stack traces). */
export function publicMessage(err: AppError): string {
  switch (err.code) {
    case "LLM_AUTH":
      return "The AI provider rejected our credentials. Showing a recorded run instead.";
    case "LLM_QUOTA":
      return "The AI credit budget is exhausted. Showing a recorded run instead.";
    case "LLM_RATE_LIMIT":
    case "LLM_OVERLOADED":
    case "LLM_SERVER":
      return "The AI provider is busy right now.";
    case "LLM_TIMEOUT":
    case "DEADLINE":
      return "The AI took too long; finishing with what we have.";
    case "BUDGET_EXCEEDED":
      return "This run hit its cost cap; finishing deterministically.";
    case "RATE_LIMITED_CLIENT":
      return "Too many live runs from your network. Try the replay demo or wait a bit.";
    case "INPUT_INVALID":
      return "Some trip details are invalid.";
    case "ABORTED":
      return "Run cancelled.";
    default:
      return err.message.slice(0, 200);
  }
}
