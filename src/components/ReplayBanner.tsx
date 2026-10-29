// Import React core hooks and JSX types
import { useState, type JSX } from "react"; // React hooks and JSX namespace
// Import riyaPreset fallback generator to start preset runs
import { riyaPreset } from "../../replay/presets.js"; // preset generator for Riya's gift
// Import SSEEvent type to inspect event union
import type { SSEEvent } from "../../types/travelverse.js"; // shared SSE event type
// Import useRun hook to read active run state and trigger live planning
import { useRun } from "../state/RunProvider.js"; // global agent run context hook

// Intent: Format ISO timestamp into human-readable date and time in the user's local timezone
function formatLocalRecordedAt(isoString?: string): string { // helper to format ISO dates
  if (!isoString) return ""; // empty string fallback when no timestamp provided
  try { // attempts parsing and localization
    const dateObj = new Date(isoString); // constructs Date instance from ISO string
    if (isNaN(dateObj.getTime())) return isoString; // fallback to raw string if date is invalid
    return dateObj.toLocaleString(undefined, { // formats using browser's active locale
      dateStyle: "medium", // e.g. Oct 28, 2026
      timeStyle: "short", // e.g. 7:42 PM
    }); // closes toLocaleString
  } catch { // handles unexpected parsing exceptions gracefully
    return isoString; // returns unmodified string on error
  } // ends try-catch
} // ends formatLocalRecordedAt

// Intent: Render non-dismissible sticky top banner when replaying a recorded or offline run
export function ReplayBanner(): JSX.Element | null { // exports ReplayBanner component
  // Retrieve agent state and start method from context
  const { state, start } = useRun(); // reads agent state and start function
  // Track loading state when starting live run from the banner button
  const [isStartingLive, setIsStartingLive] = useState<boolean>(false); // tracks in-flight start

  // Guard: banner is shown ONLY when state.replayNotice is non-null per Golden Rule 9
  if (state.replayNotice === null) { // checks if replay notice is absent
    return null; // renders nothing when not in replay mode
  } // ends guard check

  // Locate the replay_notice event in accumulated events to extract recordedAt timestamp
  const replayNoticeEvent = state.events.find( // searches event history
    (ev): ev is Extract<SSEEvent, { type: "replay_notice" }> => ev.type === "replay_notice" // matches replay_notice type
  ); // resolves replay event or undefined

  // Extract recordedAt timestamp string from event
  const recordedAtRaw = replayNoticeEvent?.recordedAt; // raw ISO date string
  // Format timestamp in user's local time
  const recordedAtLocal = formatLocalRecordedAt(recordedAtRaw); // localized readable string

  // Build composite banner message according to specification:
  // "Replay - recorded <recordedAt in local time>. <reason>" (+ " (offline)" when state.offline)
  const offlineSuffix = state.offline ? " (offline)" : ""; // optional offline indicator suffix
  const recordedPrefix = recordedAtLocal ? ` recorded ${recordedAtLocal}. ` : " "; // optional recorded timestamp clause
  const bannerMessage = `Replay -${recordedPrefix}${state.replayNotice}${offlineSuffix}`; // composite message string

  // Handler to initiate a live run with the same preset
  const handleRunLive = async () => { // callback invoked when clicking 'Run it live'
    setIsStartingLive(true); // sets local loading state
    try { // handles async loading of golden run details
      let trip = riyaPreset(); // default preset trip
      try { // try dynamically loading golden run request
        const replayMod = await import("../../replay/index.js"); // loads replay index module
        const golden = replayMod.goldenFor("riya"); // retrieves golden run by preset id
        if (golden && golden.request) { // checks if request is present
          trip = golden.request; // uses exact recorded trip payload
        } // ends validation
      } catch { // fallback if dynamic import fails
        // trip remains riyaPreset()
      } // ends try-catch

      // Broadcast custom event so TripForm inputs reflect the preset details
      const PRESET_EVENT_NAME = "tv:preset"; // standard event name for preset sync
      window.dispatchEvent(new CustomEvent(PRESET_EVENT_NAME, { detail: trip })); // broadcasts event

      // Start live planning run
      await start({ // calls start function
        trip, // trip payload
        mode: "live", // explicit live mode
        presetId: "riya", // preset identifier
        routeOverride: null, // default model routes
      }); // ends start call
    } finally { // always resets loading state
      setIsStartingLive(false); // clears local loading indicator
    } // ends finally
  }; // ends handleRunLive

  // Check if planning run is currently active to disable trigger
  const isBusy = isStartingLive || state.status === "connecting" || state.status === "streaming"; // busy guard boolean

  // Render non-dismissible sticky top banner
  return ( // returns banner JSX
    <aside // aside semantic landmark
      role="banner" // banner accessibility role
      aria-label="Recorded replay notification" // accessible name
      className="sticky top-0 z-30 w-full bg-marigold-soft/95 backdrop-blur-sm border-b border-marigold/30 text-ink px-4 sm:px-6 py-2.5 shadow-sm transition-all" // sticky top banner styling
    > {/* banner content container */}
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"> {/* responsive flex row */}
        {/* Left side: Replay icon and descriptive banner text */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0"> {/* text group */}
          <span className="w-5 h-5 rounded-full bg-marigold/20 text-marigold flex items-center justify-center font-bold text-[10px] shrink-0" aria-hidden="true"> {/* icon pill */}
            ▶ {/* play icon symbol */}
          </span> {/* closes icon */}
          <p className="font-medium text-ink leading-snug"> {/* banner text paragraph */}
            {bannerMessage} {/* required replay text */}
          </p> {/* closes paragraph */}
        </div> {/* closes text group */}

        {/* Right side: 'Run it live' action button */}
        <div className="shrink-0 flex items-center gap-2"> {/* action container */}
          <button // run live button element
            type="button" // button type
            onClick={handleRunLive} // triggers live planning run
            disabled={isBusy} // disabled while busy
            className="min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-lake text-white hover:bg-lake/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer flex items-center gap-1.5" // button styling
          > {/* button contents */}
            {isStartingLive ? ( // conditional spinner
              <>
                <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" /> {/* spinner */}
                <span>Starting live...</span> {/* loading label */}
              </>
            ) : ( // default label
              <span>Run it live</span> // label specified in prompt
            )} {/* ends conditional */}
          </button> {/* closes button */}
        </div> {/* closes action container */}
      </div> {/* closes responsive flex row */}
    </aside> // closes aside banner
  ); // ends return
} // ends ReplayBanner component
