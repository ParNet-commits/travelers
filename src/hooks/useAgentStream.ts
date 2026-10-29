/**
 * React hook: start/stop a planning run and expose reducer state.
 * Fallback ladder: live stream -> (server decides) server replay -> (server unreachable) bundled offline replay.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlanRequestBody } from "../../types/travelverse.js";
import { agentReducer, initialAgentState } from "../lib/agentReducer.js";
import { StreamError, streamPlan } from "../lib/sseClient.js";
import { getAdminToken, getRouteOverride } from "../lib/adminSettings.js"; // reads stored token and route overrides

export function useAgentStream(opts: { adminToken?: string } = {}) {
  const [state, dispatch] = useReducer(agentReducer, initialAgentState);
  const abortRef = useRef<AbortController | null>(null);

  const isMountedRef = useRef<boolean>(true); // tracks component mounting to avoid state updates after unmount

  useEffect(() => { // lifecycle hook managing component unmount cleanup
    isMountedRef.current = true; // marks component mounted
    return () => { // unmount cleanup callback
      isMountedRef.current = false; // marks component unmounted
      abortRef.current?.abort(); // aborts any active fetch or stream on unmount
      abortRef.current = null; // clears reference
    }; // ends cleanup
  }, []); // runs once on mount

  const stop = useCallback(() => { // stops active run and cancels streaming
    if (abortRef.current) { // checks if active controller exists
      abortRef.current.abort(); // aborts in-flight fetch request
      abortRef.current = null; // clears reference
    } // ends check
    if (isMountedRef.current) { // verifies component is still mounted
      dispatch({ // dispatches cancelled done event to set status to idle
        type: "event", // event action type
        event: { // cancelled done event payload
          type: "done", // done event literal
          status: "cancelled", // marks run as cancelled
          seq: 0, // sequential counter
          t: 0, // relative time offset
          runId: state.runId ?? "", // run identifier or empty string
        }, // ends event payload
      }); // ends dispatch
    } // ends mounted check
  }, [state.runId]); // recomputes when runId changes

  const start = useCallback(
    async (body: PlanRequestBody) => {
      stop();
      const ac = new AbortController();
      abortRef.current = ac;
      dispatch({ type: "start", offline: false });
      let received = 0;
      try {
        // Resolve admin token from options or session storage
        const effectiveAdminToken = opts.adminToken ?? getAdminToken() ?? undefined; // admin token for x-tv-admin header
        // Resolve route override from body or local storage
        const effectiveRouteOverride = body.routeOverride !== undefined ? body.routeOverride : (getRouteOverride() ?? null); // model route overrides
        // Construct effective plan request body with route override
        const effectiveBody: PlanRequestBody = { // payload for streaming request
          ...body, // copies request parameters
          routeOverride: effectiveRouteOverride, // attaches route override
        }; // ends effective payload
        await streamPlan(
          effectiveBody,
          {
            onEvent: (event) => {
              received += 1;
              dispatch({ type: "event", event });
            },
          },
          { signal: ac.signal, adminToken: effectiveAdminToken },
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
          const { playGoldenRun } = await import("../lib/replayPlayer.js");
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
