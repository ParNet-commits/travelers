/** Robust JSON extraction from reasoning-model output (<think> blocks, code fences, chatter around the object). */
import type { z } from "zod";

/** Removes reasoning. Text after the last </think> is the answer; an unclosed <think> means the answer was cut off. */
export function stripThink(text: string): { text: string; unterminated: boolean } {
  const close = text.lastIndexOf("</think>");
  if (close >= 0) return { text: text.slice(close + "</think>".length), unterminated: false };
  const open = text.indexOf("<think>");
  if (open >= 0) return { text: text.slice(0, open), unterminated: true };
  return { text, unterminated: false };
}

function balancedEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every top-level JSON object that parses, in order of appearance (max 6). */
export function extractJsonCandidates(text: string): unknown[] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/```(?:json)?/gi, " ");
  const out: unknown[] = [];
  let from = 0;
  while (out.length < 6) {
    const start = cleaned.indexOf("{", from);
    if (start < 0) break;
    const end = balancedEnd(cleaned, start);
    if (end < 0) break;
    try {
      out.push(JSON.parse(cleaned.slice(start, end + 1)));
      from = end + 1;
    } catch {
      from = start + 1;
    }
  }
  return out;
}

export function summarizeIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, max = 8): string {
  return issues
    .slice(0, max)
    .map((i) => `- ${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

/** Tries candidates from last to first (final answers come last). */
export function parseFirstValid<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; issues: string } {
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) return { ok: false, issues: "- (root): no JSON object found in the output" };
  let firstIssues = "";
  for (let i = candidates.length - 1; i >= 0; i--) {
    const r = schema.safeParse(candidates[i]);
    if (r.success) return { ok: true, data: r.data };
    if (!firstIssues) firstIssues = summarizeIssues(r.error.issues);
  }
  return { ok: false, issues: firstIssues };
}
