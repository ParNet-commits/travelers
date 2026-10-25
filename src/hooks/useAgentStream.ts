/**
 * React hook: start/stop a planning run and expose reducer state.
 * Fallback ladder: live stream -> (server decides) server replay -> (server unreachable) bundled offline replay.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlanRequestBody } from "../../types/travelverse.js";
import { agentReducer, initialAgentState } from "../lib/agentReducer.js";
import { playGoldenRun } from "../lib/replayPlayer.js";
import { StreamError, streamPlan } from "../lib/sseClient.js";

export function useAgentStream(opts: { adminToken?: string } = {}) {
  const [state, dispatch] = useReducer(agentReducer, initialAgentState);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (body: PlanRequestBody) => {
      stop();
      const ac = new AbortController();
      abortRef.current = ac;
      dispatch({ type: "start", offline: false });
      let received = 0;
      try {
        await streamPlan(
          body,
          {
            onEvent: (event) => {
              received += 1;
              dispatch({ type: "event", event });
            },
          },
          { signal: ac.signal, adminToken: opts.adminToken },
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        const se = err instanceof StreamError ? err : new StreamError("network", "Unexpected client error");
        const clientError = se.kind === "http" && se.status !== null && se.status >= 400 && se.status < 500;
        // Lazy-loaded so the recorded run (hundreds of KB) is only downloaded when it is actually needed.
        const { goldenFor } = await import("../../replay/index.js");
        const golden = goldenFor(body.presetId);
        if (golden && !clientError) {
          dispatch({ type: "start", offline: true });
          await playGoldenRun(golden, (event) => dispatch({ type: "event", event }), {
            speed: 1.5,
            maxGapMs: 1500,
            signal: ac.signal,
            reason: received > 0 ? "Connection lost mid-run; replaying the recorded run in your browser." : "Server unreachable; replaying the recorded run in your browser.",
          });
          return;
        }
        dispatch({ type: "fail", code: se.code, message: se.message });
      }
    },
    [stop, opts.adminToken],
  );

  const choose = useCallback((optionId: "A" | "B") => dispatch({ type: "choose", optionId }), []);
  const reset = useCallback(() => {
    stop();
    dispatch({ type: "reset" });
  }, [stop]);

  return { state, start, stop, choose, reset };
}
