/** Isomorphic (browser + server) golden-run registry and replay mapping. No Node imports here. */
import type { FinalItinerary, GoldenRun, SSEEvent, SSEEventInput } from "../types/travelverse.js";
import { RIYA_RUN } from "./runs/riya.js";

export const GOLDEN_RUNS: readonly GoldenRun[] = [RIYA_RUN].filter((r): r is GoldenRun => r !== null);

export function goldenFor(presetId: string | null): GoldenRun | null {
  if (!presetId) return null;
  return GOLDEN_RUNS.find((r) => r.id === presetId) ?? null;
}

const asReplayItin = (it: FinalItinerary): FinalItinerary => ({ ...it, mode: "replay" });

/** Strips transport fields and marks everything as replay, so a replay can never be mistaken for a live run. */
export function toReplayInput(ev: SSEEvent): SSEEventInput {
  switch (ev.type) {
    case "run_started":
      return { type: ev.type, mode: "replay", models: ev.models, destination: ev.destination };
    case "draft":
      return { type: ev.type, round: ev.round, itinerary: asReplayItin(ev.itinerary) };
    case "plan_finalized":
      return { type: ev.type, itinerary: asReplayItin(ev.itinerary) };
    case "tradeoff_required":
      return { type: ev.type, round: ev.round, message: ev.message, options: ev.options.map((o) => ({ ...o, itinerary: asReplayItin(o.itinerary) })) };
    default: {
      const { seq, t, runId, ...rest } = ev;
      void seq;
      void t;
      void runId;
      return rest;
    }
  }
}
