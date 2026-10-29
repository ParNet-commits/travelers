// Import React core hooks and types
import { useEffect, useState, type JSX } from "react"; // React hooks for lifecycle and state
// Import riyaPreset generator function to build the anniversary trip request
import { riyaPreset } from "../../replay/presets.js"; // preset generator for Riya's gift
// Import shared types for TripRequest and RunMode
import type { TripRequest } from "../../types/travelverse.js"; // shared trip contract
// Import useRun hook to trigger agent planning runs
import { useRun } from "../state/RunProvider.js"; // global run context consumer

// Define component props interface
export interface PresetCardProps { // props interface for PresetCard
  // Optional callback to notify parent components to populate form fields with preset
  onSelectPreset?: (trip: TripRequest) => void; // callback receiving generated TripRequest
  // Optional callback invoked when planning starts to scroll timeline and switch tab
  onPlanStarted?: () => void; // callback notifying parent of planning activation
} // ends props interface

// Intent: Render emotional hero preset card for Riya's gift with live and replay action buttons
export function PresetCard({ onSelectPreset, onPlanStarted }: PresetCardProps): JSX.Element { // exports PresetCard component
  // Access agent start function and current run status from context
  const { start, state } = useRun(); // retrieves run actions and state
  // Track whether any recorded golden run is available for replay
  const [hasGoldenRun, setHasGoldenRun] = useState<boolean>(false); // boolean flag controlling replay button visibility

  // Check dynamically if a golden run exists without pulling the replay bundle eagerly
  useEffect(() => { // lifecycle hook for dynamic import
    // Flag to cancel state update if component unmounts
    let isMounted = true; // prevents state updates after unmount
    // Dynamically load replay index module
    import("../../replay/index.js") // async dynamic import
      .then((replayMod) => { // handle successful module resolution
        // Check if component is still mounted and runs array has at least one entry
        const MIN_RUNS_COUNT = 0; // threshold to check existence of golden runs
        if (isMounted && replayMod.GOLDEN_RUNS && replayMod.GOLDEN_RUNS.length > MIN_RUNS_COUNT) { // validation
          // Enable replay button
          setHasGoldenRun(true); // updates golden run presence state
        } // ends validation
      }) // ends then
      .catch(() => { // catch module loading failures gracefully
        // Fallback: keep hasGoldenRun as false
        if (isMounted) setHasGoldenRun(false); // sets false on failure
      }); // ends catch
    // Cleanup function when unmounting
    return () => { // cleanup callback
      // Mark component as unmounted
      isMounted = false; // prevents memory leaks
    }; // ends cleanup
  }, []); // run once on mount

  // Helper function to trigger a run with Riya's preset and populate the form fields
  const handleSelectRun = async (mode: "live" | "replay") => { // click handler for live or replay actions
    // Default trip object based on current calendar date
    let trip = riyaPreset(); // builds TripRequest with 10-day forecast offset
    // For replay mode, ensure trip form matches the recorded run's exact details
    if (mode === "replay") { // checks if replay mode selected
      try { // try dynamically loading golden run
        const replayMod = await import("../../replay/index.js"); // loads replay index module
        const golden = replayMod.goldenFor("riya"); // finds golden run by id
        if (golden && golden.request) { // validates presence of golden request
          trip = golden.request; // uses exact recorded trip request
        } // ends validation
      } catch { // fallback gracefully if import fails
        // trip remains riyaPreset() fallback
      } // ends try-catch
    } // ends replay mode check
    // Dispatch custom browser event so any listening form instance updates its inputs
    const PRESET_EVENT_NAME = "tv:preset"; // standard event name for preset synchronization
    window.dispatchEvent(new CustomEvent(PRESET_EVENT_NAME, { detail: trip })); // broadcasts trip to form
    // Invoke parent callback if provided
    if (onSelectPreset) { // checks if callback is passed
      onSelectPreset(trip); // notifies parent container
    } // ends callback invocation
    // Notify parent that planning run has started to switch tab and scroll
    if (onPlanStarted) { // checks if callback is provided
      onPlanStarted(); // triggers tab switch and auto-scroll
    } // ends callback check
    // Start the agent run via shared context
    await start({ // calls start function
      trip, // trip payload
      mode, // selected execution mode ('live' or 'replay')
      presetId: "riya", // identifier for golden run matching and reporting
      routeOverride: null, // default model routing
    }); // ends start call
  }; // ends handleSelectRun

  // Check if run is currently in-flight to disable interactive triggers
  const isBusy = state.status === "connecting" || state.status === "streaming"; // active run guard

  // Render preset card UI
  return ( // returns card JSX
    <div className="bg-card border border-line rounded-2xl p-6 shadow-sm relative overflow-hidden"> {/* card wrapper */}
      {/* Decorative warm accent ribbon at top */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-marigold via-marigold-soft to-lake" aria-hidden="true" /> {/* accent border */}

      {/* Preset header with category tag and emotional title */}
      <div className="space-y-1.5"> {/* header container */}
        <span className="inline-flex items-center text-xs font-semibold tracking-wider uppercase text-marigold"> {/* category badge */}
          Featured Story {/* badge label */}
        </span> {/* closes badge */}
        <h2 className="text-xl font-semibold text-ink font-display"> {/* story headline */}
          Riya's gift {/* title of preset */}
        </h2> {/* closes headline */}
      </div> {/* closes header container */}

      {/* Emotional story narrative description */}
      <p className="mt-3 text-sm text-ink-soft leading-relaxed"> {/* narrative paragraph */}
        Riya is sending her parents to Udaipur for their 30th anniversary. USD 900, four days, and Dad can't manage stairs. {/* prompt narrative text */}
      </p> {/* closes narrative paragraph */}

      {/* Action buttons group for planning live or watching recorded run */}
      <div className="mt-5 flex flex-col sm:flex-row gap-3"> {/* buttons flex layout */}
        {/* Primary live planning button */}
        <button // button element
          type="button" // explicit button type
          onClick={() => handleSelectRun("live")} // triggers live agent planning
          disabled={isBusy} // disables while agent is processing
          className="min-h-11 flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-lake hover:bg-lake/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer" // button styling
        > {/* button contents */}
          <span>Plan it live</span> {/* button label */}
        </button> {/* closes button */}

        {/* Secondary replay button, shown only when golden run exists */}
        {hasGoldenRun && ( // conditional render based on golden run availability
          <button // replay button element
            type="button" // explicit button type
            onClick={() => handleSelectRun("replay")} // triggers recorded replay
            disabled={isBusy} // disables while busy
            className="min-h-11 flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-ink bg-sand hover:bg-marigold-soft/60 border border-line disabled:opacity-50 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer" // secondary button styling
          > {/* button contents */}
            <span>Watch the recorded run</span> {/* button label */}
          </button> // closes replay button
        )} {/* ends conditional render */}
      </div> {/* closes buttons group */}
    </div> // closes card wrapper
  ); // ends return
} // ends PresetCard component
