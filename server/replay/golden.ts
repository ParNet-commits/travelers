/** Server-side replay: re-emits a recorded run with its original pacing (sped up, long gaps capped). */
import type { GoldenRun } from "../../types/travelverse.js";
import { toReplayInput } from "../../replay/index.js";
import type { Emit } from "../agents/common.js";
import { sleep } from "../http/fetchJson.js";

export async function streamGoldenRun(
  run: GoldenRun,
  emit: Emit,
  signal: AbortSignal,
  o: { speed: number; maxGapMs: number; reason: string },
): Promise<void> {
  emit({ type: "replay_notice", reason: o.reason.slice(0, 300), recordedAt: run.recordedAt });
  let prevT = 0;
  for (const ev of run.events) {
    if (signal.aborted) return;
    const gap = Math.min(Math.max(0, ev.t - prevT) / o.speed, o.maxGapMs);
    prevT = ev.t;
    if (gap >= 5) {
      try {
        await sleep(gap, signal);
      } catch {
        return;
      }
    }
    emit(toReplayInput(ev));
  }
}
