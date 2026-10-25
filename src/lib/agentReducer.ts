/** Pure state machine for the run UI. Every SSE event goes through here; the UI renders only this state. */
import type { FinalItinerary, RunMode, SSEEvent, TradeoffOption } from "../../types/travelverse.js";

export type UsageEvent = Extract<SSEEvent, { type: "usage" }>;

export interface AgentState {
  status: "idle" | "connecting" | "streaming" | "awaiting_user" | "done" | "error";
  runId: string | null;
  mode: RunMode | null;
  /** non-null => the mandatory "Replay" banner is shown */
  replayNotice: string | null;
  /** true when the browser is replaying the bundled run because the server was unreachable */
  offline: boolean;
  events: SSEEvent[];
  round: number;
  draft: FinalItinerary | null;
  final: FinalItinerary | null;
  tradeoff: { message: string; options: TradeoffOption[] } | null;
  chosenOption: "A" | "B" | null;
  usage: UsageEvent | null;
  error: { code: string; message: string } | null;
}

export type AgentAction =
  | { type: "start"; offline: boolean }
  | { type: "event"; event: SSEEvent }
  | { type: "fail"; code: string; message: string }
  | { type: "choose"; optionId: "A" | "B" }
  | { type: "reset" };

export const initialAgentState: AgentState = {
  status: "idle",
  runId: null,
  mode: null,
  replayNotice: null,
  offline: false,
  events: [],
  round: 0,
  draft: null,
  final: null,
  tradeoff: null,
  chosenOption: null,
  usage: null,
  error: null,
};

const MAX_EVENTS = 600;

export function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case "reset":
      return initialAgentState;
    case "start":
      return { ...initialAgentState, status: "connecting", offline: action.offline };
    case "fail":
      return { ...state, status: "error", error: { code: action.code, message: action.message } };
    case "choose": {
      const opt = state.tradeoff?.options.find((o) => o.id === action.optionId);
      if (!opt) return state;
      return { ...state, chosenOption: opt.id, final: opt.itinerary, draft: opt.itinerary, status: "done" };
    }
    case "event": {
      const ev = action.event;
      if (ev.type === "replay_notice") {
        // A replay always starts from a clean slate (it may follow a failed live attempt).
        return { ...initialAgentState, status: "streaming", offline: state.offline, mode: "replay", replayNotice: ev.reason, events: [ev] };
      }
      const events = state.events.length >= MAX_EVENTS ? [...state.events.slice(-(MAX_EVENTS - 1)), ev] : [...state.events, ev];
      const base: AgentState = { ...state, events, status: state.status === "connecting" ? "streaming" : state.status };
      switch (ev.type) {
        case "run_started":
          return { ...base, runId: ev.runId, mode: state.replayNotice ? "replay" : ev.mode };
        case "draft":
          return { ...base, draft: ev.itinerary, round: ev.round };
        case "replan":
          return { ...base, round: ev.round };
        case "plan_finalized":
          return { ...base, final: ev.itinerary, draft: ev.itinerary };
        case "tradeoff_required":
          return { ...base, tradeoff: { message: ev.message, options: ev.options } };
        case "usage":
          return { ...base, usage: ev };
        case "error":
          return { ...base, error: { code: ev.code, message: ev.message } };
        case "done": {
          if (ev.status === "awaiting_user") return { ...base, status: "awaiting_user" };
          if (ev.status === "finalized") return { ...base, status: "done" };
          if (ev.status === "cancelled") return { ...base, status: "idle" };
          return { ...base, status: base.final ? "done" : "error", error: base.error ?? { code: "FAILED", message: "The run did not finish." } };
        }
        default:
          return base;
      }
    }
  }
}
