/**
 * Accessibility Proof Engine (Tavily Extract + Nemotron Nano + verbatim verification).
 *
 *  targets (top places + hotels) -> official URL (curated / OSM website / Tavily Search on official domains)
 *  -> ONE Tavily Extract call (query-focused chunks) -> injection screen -> candidate sentences (keyword filter)
 *  -> Nano judge picks status + sentence id + quote -> code verifies the quote is verbatim on the page
 *  -> Evidence[] (only verified quotes count; otherwise keyword verdict on the page's own sentences)
 *
 * Nothing the LLM writes reaches the user unless it is a verbatim substring of the extracted page.
 */
import { AccessibilityVerdicts, type Evidence, type StepFreeStatus } from "../../types/travelverse.js";
import { llmJson, withTool, type AgentRun } from "../agents/common.js";
import { normalizeId } from "../engine/normalize.js";
import { ACCESS_SYSTEM } from "../llm/prompts.js";
import { hostOf, isOfficialDomain } from "../orchestrator/context.js";
import { detectInjection, verifyVerbatimQuote, wrapUntrusted } from "../security/untrusted.js";

export interface ProofTarget {
  id: string;
  name: string;
  kind: "place" | "lodging";
  url: string | null;
}

export const ACCESS_QUERY = "wheelchair access, step-free entry, ramps, lifts or elevators, stairs and steps, accessibility for elderly visitors";

const KEYWORDS = /(wheelchair|accessib|step[- ]?free|ramp|lift|elevator|stair|steps|staircase|climb|mobility|disab|level access|handrail|senior)/gi;
const NEGATIVE =
  /\b(not (wheelchair[- ])?accessible|inaccessible|no (lifts?|elevators?|ramps?)|(steep|narrow|many|several|numerous|\d{2,}) (stairs|steps)|stairs? only|only (by|via) (stairs|steps)|climb(ing)? (up )?(the )?(stairs|steps))\b/i;
const POSITIVE =
  /\b(wheelchair[- ](accessible|friendly)|step[- ]free|level access|ramps? (is |are )?available|(lifts?|elevators?) (is |are )?available|accessible (entrance|toilets?|route|path))\b/i;

export function candidateSentences(text: string, max = 5): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 300);
  return sentences
    .map((s, i) => ({ s, i, score: (s.match(KEYWORDS) ?? []).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.s);
}

export function keywordVerdict(sentences: readonly string[]): { status: StepFreeStatus; quote: string } {
  const neg = sentences.find((s) => NEGATIVE.test(s));
  const pos = sentences.find((s) => POSITIVE.test(s));
  if (neg && pos) return { status: "partial", quote: neg };
  if (neg) return { status: "not_step_free", quote: neg };
  if (pos) return { status: "step_free", quote: pos };
  return { status: "unverified", quote: "" };
}

function sameUrl(a: string, b: string): boolean {
  const n = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[/#?]+$/, "");
  return n(a) === n(b);
}

export async function runAccessibilityProof(
  run: AgentRun,
  targetsIn: readonly ProofTarget[],
  opts: { destination: string; officialDomains: readonly string[] },
): Promise<Evidence[]> {
  if (targetsIn.length === 0) return [];
  if (!run.deps.config.tavilyApiKey) {
    run.emit({ type: "thinking", agent: "accessibility_proof", text: "Tavily is not configured; step-free status comes from curated data and OpenStreetMap only." });
    return [];
  }
  const today = run.deps.today();
  const targets = targetsIn.slice(0, 6).map((t) => ({ ...t }));
  run.emit({ type: "thinking", agent: "accessibility_proof", text: `Checking step-free access for ${targets.length} stop(s) against official pages with Tavily Extract.` });

  // 1) Find a URL for up to two targets that have none (Tavily Search, official domains first).
  let searches = 0;
  for (const t of targets) {
    if (t.url || searches >= 2 || !run.budget.canSpendTavily(1)) continue;
    searches += 1;
    const hits = await withTool(run, "accessibility_proof", "tavily.search", { query: `${t.name} ${opts.destination} wheelchair access` }, () =>
      run.deps.tools.webSearch({ query: `${t.name} ${opts.destination} wheelchair access steps`, topic: "general", maxResults: 3 }, run.signal),
    );
    const pick = (hits ?? []).find((h) => isOfficialDomain(h.url, opts.officialDomains)) ?? (hits ?? [])[0];
    t.url = pick?.url ?? null;
  }

  // 2) One Extract call for every target with a URL.
  const withUrl = targets.filter((t): t is ProofTarget & { url: string } => t.url !== null);
  if (withUrl.length === 0 || !run.budget.canSpendTavily(2)) return [];
  const ex = await withTool(run, "accessibility_proof", "tavily.extract", { urls: withUrl.length, query: "step-free access" }, () =>
    run.deps.tools.extract({ urls: withUrl.map((t) => t.url), query: ACCESS_QUERY }, run.signal),
  );
  if (!ex) return [];

  // 3) Candidate sentences per target (pages that look like injection are skipped).
  const sentences: Array<{ sid: string; targetId: string; text: string }> = [];
  const pageOf = new Map<string, string>();
  for (const t of withUrl) {
    const page = ex.pages.find((p) => sameUrl(p.url, t.url));
    if (!page) continue;
    if (detectInjection(page.text).length > 0) {
      run.emit({ type: "thinking", agent: "accessibility_proof", text: `Ignored ${hostOf(t.url)}: page content looked like prompt injection.` });
      continue;
    }
    pageOf.set(t.id, page.text);
    for (const s of candidateSentences(page.text)) sentences.push({ sid: `S${sentences.length + 1}`, targetId: t.id, text: s });
  }
  if (sentences.length === 0) {
    run.emit({ type: "thinking", agent: "accessibility_proof", text: "No accessibility statements found on the extracted pages; statuses stay unverified." });
    return [];
  }

  // 4) Nano judge (temperature low). Ids and verbatim quotes only.
  const brief = [
    `TARGETS: ${JSON.stringify(withUrl.filter((t) => pageOf.has(t.id)).map((t) => ({ targetId: t.id, name: t.name, kind: t.kind })))}`,
    "SENTENCES:",
    ...sentences.map((s) => wrapUntrusted(s.sid, `extract:${s.targetId}`, null, s.text, 320)),
  ].join("\n");
  const out = await llmJson(run, {
    agent: "accessibility_proof",
    role: "fast",
    system: ACCESS_SYSTEM,
    user: brief,
    schema: AccessibilityVerdicts,
    schemaName: "AccessibilityVerdicts",
    temperature: 0.2,
  });

  // 5) Verify and build evidence.
  const evidence: Evidence[] = [];
  for (const t of withUrl) {
    const page = pageOf.get(t.id);
    if (!page) continue;
    const mine = sentences.filter((s) => s.targetId === t.id);
    const v = out?.data.verdicts.find((x) => normalizeId(x.targetId) === t.id);
    const cited = v ? mine.find((s) => s.sid === v.sentenceId.trim()) : undefined;
    let status: StepFreeStatus = "unverified";
    let quote = "";
    if (v && v.status !== "unverified" && cited && verifyVerbatimQuote(v.quote, cited.text) && verifyVerbatimQuote(v.quote, page)) {
      status = v.status;
      quote = v.quote.trim();
    } else {
      const k = keywordVerdict(mine.map((s) => s.text));
      if (k.status !== "unverified" && verifyVerbatimQuote(k.quote, page)) {
        status = k.status;
        quote = k.quote;
      }
    }
    if (status === "unverified") continue;
    evidence.push({
      targetId: t.id,
      status,
      method: "tavily_extract",
      url: t.url,
      domain: hostOf(t.url),
      quote: quote.slice(0, 400),
      verbatimVerified: true,
      official: isOfficialDomain(t.url, opts.officialDomains),
      retrievedAt: today,
    });
  }
  const count = (s: StepFreeStatus) => evidence.filter((e) => e.status === s).length;
  run.emit({
    type: "thinking",
    agent: "accessibility_proof",
    text: `Verified ${evidence.length}/${withUrl.length} with verbatim quotes: ${count("step_free")} step-free, ${count("partial")} partial, ${count("not_step_free")} not step-free.`,
  });
  return evidence;
}
