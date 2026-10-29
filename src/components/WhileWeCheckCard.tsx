// Import React hooks and JSX types
import { useEffect, useState, type JSX } from "react"; // imports React primitives for timer state and JSX
// Import useRun hook to read active agent execution status and mode
import { useRun } from "../state/RunProvider.js"; // global agent state provider hook

// Define named constant for rotation interval in milliseconds
const ROTATION_INTERVAL_MS = 6000; // changes item every 6 seconds as required
// Define named constant for initial starting index
const INITIAL_ROTATION_INDEX = 0; // begins rotation at first item
// Define named constant for index increment step
const ROTATION_STEP = 1; // single-step forward progression

// Interface defining the structure of an informational card rotation item
interface WhileWeCheckItem { // contract for rotation item entry
  readonly type: "agent" | "destination"; // indicates whether item explains an agent or destination fact
  readonly title: string; // short category or role badge title
  readonly text: string; // verbatim content taken from curated data or agent role definitions
} // ends WhileWeCheckItem interface

// List of truthful items: alternating between agent activities and verified destination facts from curated city pack
const ROTATION_ITEMS: readonly WhileWeCheckItem[] = [ // array of rotating snippets
  { // item 1: Conditions Scout agent operation
    type: "agent", // agent activity item
    title: "Conditions Scout", // agent role title
    text: "Conditions Scout is checking Open-Meteo forecasts for rain and midday heat in Udaipur.", // explanation of real weather tool task
  }, // ends item 1
  { // item 2: Udaipur geography fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "Udaipur, known as the 'City of Lakes', links Lake Pichola, Fateh Sagar, Swaroop Sagar, and Udai Sagar.", // curated fact from city pack
  }, // ends item 2
  { // item 3: Explorer agent operation
    type: "agent", // agent activity item
    title: "Explorer Agent", // agent role title
    text: "Explorer is mapping attractions and checking visiting hours from official heritage trusts.", // explanation of mapping and hours task
  }, // ends item 3
  { // item 4: City Palace Museum fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "City Palace Museum standard admission is Rs 400; modern wings feature accessible lifts and ramps.", // curated fact from places catalog
  }, // ends item 4
  { // item 5: Accessibility Proof agent operation
    type: "agent", // agent activity item
    title: "Accessibility Proof", // agent role title
    text: "Accessibility Proof is evaluating step-free access and physical mobility proofs via Tavily.", // explanation of Tavily verification task
  }, // ends item 5
  { // item 6: Fateh Sagar Lake Promenade fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "Fateh Sagar Lake Promenade provides continuous level, step-free access along the pedestrian embankment.", // curated fact from places catalog
  }, // ends item 6
  { // item 7: Budget Keeper agent operation
    type: "agent", // agent activity item
    title: "Budget Keeper", // agent role title
    text: "Budget Keeper is calculating room tariffs, meal allowances, taxi fares, and FX conversions.", // explanation of budget calculation task
  }, // ends item 7
  { // item 8: Jagdish Temple fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "Jagdish Temple, built in 1651 CE, stands on a raised plinth reached via a steep flight of 32 marble stairs.", // curated fact from places catalog
  }, // ends item 8
  { // item 9: Critic agent operation
    type: "agent", // agent activity item
    title: "Critic Agent", // agent role title
    text: "Critic is inspecting draft stops against deterministic rules R0–R8 to catch violations.", // explanation of verification task
  }, // ends item 9
  { // item 10: Saheliyon ki Bari fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "Saheliyon ki Bari features marble elephants and historical fountains powered entirely by gravity.", // curated fact from places catalog
  }, // ends item 10
  { // item 11: Orchestrator agent operation
    type: "agent", // agent activity item
    title: "Orchestrator", // agent role title
    text: "Orchestrator is coordinating Nemotron models across planning and repair iterations.", // explanation of orchestration task
  }, // ends item 11
  { // item 12: Bagore ki Haveli fact
    type: "destination", // destination fact item
    title: "Destination Fact", // fact category title
    text: "Bagore ki Haveli is an 18th-century waterfront palace at Gangaur Ghat hosting the nightly Dharohar folk dance.", // curated fact from places catalog
  }, // ends item 12
]; // ends ROTATION_ITEMS array

// Intent: Render small rotating "While we check…" card during a live plan only; hidden when plan finishes
export function WhileWeCheckCard(): JSX.Element | null { // exports rotating live status card component
  // Read current agent run state from global context
  const { state } = useRun(); // extracts shared run state
  // Track currently displayed rotation item index
  const [currentIndex, setCurrentIndex] = useState<number>(INITIAL_ROTATION_INDEX); // state for current slide index

  // Guard: Determine if system is actively executing a live plan (not replay, not offline, streaming or connecting)
  const isLivePlanning = // boolean flag for active live plan
    state.mode === "live" && // must be live mode
    state.replayNotice === null && // must not be in replay mode
    !state.offline && // must not be offline
    (state.status === "streaming" || state.status === "connecting"); // must be actively streaming or connecting

  // Set up 6-second interval rotation timer active only while live planning
  useEffect(() => { // lifecycle effect hook
    // Guard: do not start rotation timer if not in active live planning
    if (!isLivePlanning) { // checks if live planning is inactive
      return; // exits without scheduling timer
    } // ends check

    // Schedule recurring interval timer to advance slide every 6 seconds
    const intervalTimer = setInterval(() => { // registers recurring timer
      setCurrentIndex((previousIndex) => (previousIndex + ROTATION_STEP) % ROTATION_ITEMS.length); // advances index circularly
    }, ROTATION_INTERVAL_MS); // 6000 millisecond interval

    // Cleanup callback to clear interval timer on unmount or when planning concludes
    return () => { // returns cleanup function
      clearInterval(intervalTimer); // clears interval timer
    }; // ends cleanup
  }, [isLivePlanning]); // re-runs when live planning status toggles

  // Guard: Hide component completely when not actively in a live plan
  if (!isLivePlanning) { // checks if live plan is finished or absent
    return null; // renders nothing when plan finishes
  } // ends guard

  // Read current rotation item from array using active index
  const activeItem = ROTATION_ITEMS[currentIndex]; // resolves active item safely

  // Render small rotating "While we check…" card
  return ( // returns card JSX
    <aside // semantic aside element for live supplementary updates
      role="region" // accessible landmark region
      aria-label="While we check destination facts and agent progress" // accessible label
      aria-live="polite" // screen readers politely announce rotated content
      className="bg-card border border-lake/30 bg-lake-soft/20 rounded-2xl p-4 shadow-sm space-y-2 transition-all duration-300" // container styling
    > {/* card content container */}
      <div className="flex items-center justify-between"> {/* header row */}
        <div className="flex items-center gap-2"> {/* title group */}
          <span className="w-2 h-2 rounded-full bg-lake animate-pulse" aria-hidden="true" /> {/* pulsing live activity dot */}
          <h4 className="text-xs font-semibold uppercase tracking-wider text-lake font-display"> {/* card heading */}
            While we check… {/* required card title */}
          </h4> {/* closes heading */}
        </div> {/* closes title group */}
        <span className="text-[10px] font-medium text-ink-soft bg-sand/90 px-2 py-0.5 rounded-full border border-line"> {/* badge */}
          {activeItem.title} {/* badge title */}
        </span> {/* closes badge */}
      </div> {/* closes header row */}

      {/* Main rotation content paragraph */}
      <p className="text-xs text-ink leading-relaxed transition-opacity duration-300 min-h-[38px] flex items-center"> {/* message text */}
        {activeItem.text} {/* factual line or agent activity line */}
      </p> {/* closes message text */}

      {/* Footer metadata row */}
      <div className="flex items-center justify-between text-[10px] text-ink-soft/75 pt-1.5 border-t border-lake/15"> {/* footer row */}
        <span>Verified data & agent checks</span> {/* provenance notice */}
        <span>Updates every 6s</span> {/* cadence indicator */}
      </div> {/* closes footer row */}
    </aside> // closes aside element
  ); // ends return
} // ends WhileWeCheckCard component
