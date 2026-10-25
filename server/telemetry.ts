/** In-memory, per-instance counters for the Control Room. Serverless instances are short-lived: treat as indicative. */
import type { RunMode } from "../types/travelverse.js";

export interface RecentRun {
  at: string;
  destination: string;
  mode: RunMode;
  status: string;
  rounds: number;
  estUsd: number;
  ms: number;
}

const state = {
  startedAt: new Date().toISOString(),
  runs: 0,
  liveRuns: 0,
  replayRuns: 0,
  estUsd: 0,
  tavilyCredits: 0,
  recent: [] as RecentRun[],
};

export function recordRun(r: RecentRun & { tavilyCredits: number }): void {
  state.runs += 1;
  if (r.mode === "live") state.liveRuns += 1;
  else state.replayRuns += 1;
  state.estUsd += r.estUsd;
  state.tavilyCredits += r.tavilyCredits;
  state.recent.unshift({ at: r.at, destination: r.destination, mode: r.mode, status: r.status, rounds: r.rounds, estUsd: r.estUsd, ms: r.ms });
  if (state.recent.length > 20) state.recent.length = 20;
}

export function telemetrySnapshot() {
  return {
    startedAt: state.startedAt,
    runs: state.runs,
    liveRuns: state.liveRuns,
    replayRuns: state.replayRuns,
    estUsd: Math.round(state.estUsd * 10_000) / 10_000,
    tavilyCredits: state.tavilyCredits,
    recentRuns: [...state.recent],
  };
}

/** One JSON line per log entry. Never pass secrets, prompts or raw web content here. */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, string | number | boolean | null> = {}): void {
  const line = JSON.stringify({ level, msg, ...data, ts: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
