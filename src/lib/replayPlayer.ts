/** Tier-3 fallback: replays the bundled golden run in the browser when the server cannot be reached. */
import { SSEEvent, type GoldenRun } from "../../types/travelverse.js";
import { toReplayInput } from "../../replay/index.js";

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function playGoldenRun(
  run: GoldenRun,
  onEvent: (ev: SSEEvent) => void,
  o: { speed: number; maxGapMs: number; signal: AbortSignal; reason: string },
): Promise<void> {
  const runId = `offline_${run.id}`.slice(0, 40);
  let seq = 0;
  const started = Date.now();
  // parse (not cast): the bundled run is re-validated event by event before the UI sees it
  const stamp = (input: ReturnType<typeof toReplayInput>): SSEEvent => SSEEvent.parse({ ...input, seq: seq++, t: Date.now() - started, runId });
  onEvent(stamp({ type: "replay_notice", reason: o.reason, recordedAt: run.recordedAt }));
  let prevT = 0;
  for (const ev of run.events) {
    const gap = Math.min(Math.max(0, ev.t - prevT) / o.speed, o.maxGapMs);
    prevT = ev.t;
    if (gap >= 5 && !(await wait(gap, o.signal))) return;
    if (o.signal.aborted) return;
    onEvent(stamp(toReplayInput(ev)));
  }
}
