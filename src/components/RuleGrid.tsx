// Import React type definitions and JSX types
import type { JSX } from "react"; // imports JSX element type
// Import helpers for model name formatting and rule labels
import { RULE_SHORT, shortModelName } from "../lib/format.js"; // UI label formatting helpers
// Import useRun hook to read agent run state and events
import { useRun } from "../state/RunProvider.js"; // global agent state provider hook
// Import shared types for RuleId and SSEEvent
import type { RuleId, SSEEvent } from "../../types/travelverse.js"; // core travel contracts

// Define named constant list of all nine canonical rules in strict evaluation order
const ALL_RULE_IDS: readonly RuleId[] = [ // array of all rule identifiers from R0 to R8
  "R0", // data integrity and provenance rule
  "R1", // strict budget limit rule
  "R2", // opening hours and schedule rule
  "R3", // maximum walking distance rule
  "R4", // transit routing and travel time rule
  "R5", // outdoor weather and temperature forecast rule
  "R6", // step-free wheelchair accessibility rule
  "R7", // maximum day length and pacing rule
  "R8", // required afternoon rest break rule
]; // ends ALL_RULE_IDS array

// Define named constant for empty collection count check
const EMPTY_COLLECTION_COUNT = 0; // threshold for empty event lists

// Intent: Render status icon reflecting pass, fail, warn, or skip validation outcome
function StatusIcon({ status }: { status: "pass" | "fail" | "warn" | "skip" | "pending" }): JSX.Element { // helper icon component
  // Handle pass status with bold checkmark SVG
  if (status === "pass") { // checks for passing outcome
    return ( // returns checkmark icon
      <svg // checkmark SVG element
        className="w-3.5 h-3.5 shrink-0 text-ok" // styling for green checkmark
        fill="none" // no fill
        viewBox="0 0 24 24" // standard viewport
        stroke="currentColor" // stroke uses text color
        strokeWidth={3} // thick readable stroke
        aria-hidden="true" // hides from screen readers in favor of text
      > {/* path definition */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
      </svg> // closes SVG
    ); // ends return
  } // ends pass check

  // Handle fail status with bold cross SVG
  if (status === "fail") { // checks for failed outcome
    return ( // returns cross icon
      <svg // cross SVG element
        className="w-3.5 h-3.5 shrink-0 text-bad" // styling for red cross
        fill="none" // no fill
        viewBox="0 0 24 24" // standard viewport
        stroke="currentColor" // stroke uses text color
        strokeWidth={3} // thick readable stroke
        aria-hidden="true" // hides from screen readers
      > {/* path definition */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> {/* cross shape */}
      </svg> // closes SVG
    ); // ends return
  } // ends fail check

  // Handle warn status with exclamation symbol
  if (status === "warn") { // checks for warning outcome
    return ( // returns warning symbol
      <span className="font-extrabold text-xs text-warn leading-none" aria-hidden="true"> {/* warning glyph */}
        ! {/* exclamation character */}
      </span> // closes span
    ); // ends return
  } // ends warn check

  // Handle skip status with dash symbol
  if (status === "skip") { // checks for skipped rule outcome
    return ( // returns dash symbol
      <span className="font-bold text-xs text-ink-soft leading-none" aria-hidden="true"> {/* dash glyph */}
        — {/* horizontal dash character */}
      </span> // closes span
    ); // ends return
  } // ends skip check

  // Handle pending status with gentle subtle dot
  return ( // returns pending placeholder
    <span className="w-1.5 h-1.5 rounded-full bg-ink-soft/40" aria-hidden="true" /> // dot element
  ); // ends return
} // ends StatusIcon helper

// Intent: Render RuleGrid displaying R0-R8 rule check chips for each iteration round
export function RuleGrid(): JSX.Element { // exports RuleGrid hero component
  // Access agent run events from context
  const { state } = useRun(); // extracts shared state including events array

  // Filter rule_check events from the event stream
  const ruleCheckEvents = state.events.filter( // filters for rule check events
    (event): event is Extract<SSEEvent, { type: "rule_check" }> => event.type === "rule_check", // type predicate guard
  ); // ends filter

  // Filter draft events to associate model metadata with each round
  const draftEvents = state.events.filter( // filters for draft events
    (event): event is Extract<SSEEvent, { type: "draft" }> => event.type === "draft", // type predicate guard
  ); // ends filter

  // Extract unique rounds that have recorded rule checks
  const evaluatedRounds = Array.from( // converts unique set to array
    new Set(ruleCheckEvents.map((checkEvent) => checkEvent.round)), // extracts unique round indices
  ).sort((firstRound, secondRound) => firstRound - secondRound); // sorts numerically ascending

  // Render idle hero view when planning has not yet executed rule checks
  if (evaluatedRounds.length === EMPTY_COLLECTION_COUNT) { // check if no rounds exist yet
    return ( // returns idle state JSX
      <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-4"> {/* card container */}
        <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
          <div> {/* title group */}
            <h3 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
              Rule Verification (R0–R8) {/* section heading */}
            </h3> {/* closes title */}
            <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
              9 deterministic checks run on every draft plan {/* explanatory subtitle */}
            </p> {/* closes description */}
          </div> {/* closes title group */}
          <span className="text-[11px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* badge */}
            Standby {/* status indicator */}
          </span> {/* closes badge */}
        </div> {/* closes header row */}

        {/* 9 inactive rule chips showing what rules will be verified */}
        <div className="grid grid-cols-3 gap-2"> {/* grid container for nine chips */}
          {ALL_RULE_IDS.map((ruleId) => ( // iterate over all rule ids
            <div // inactive preview chip
              key={ruleId} // React key
              title={`${ruleId}: ${RULE_SHORT[ruleId]} - Waiting for first draft`} // preview tooltip
              className="flex items-center justify-between px-2.5 py-1.5 rounded-xl border border-line/60 bg-sand/40 text-ink-soft/70 text-xs font-medium" // chip styling
            > {/* chip content */}
              <span className="truncate">{ruleId} {RULE_SHORT[ruleId]}</span> {/* rule label */}
              <span className="text-[10px] text-ink-soft/50">—</span> {/* standby indicator */}
            </div> // closes chip
          ))} {/* ends map */}
        </div> {/* closes grid */}
      </div> // closes card container
    ); // ends return
  } // ends empty rounds condition

  // Render active RuleGrid with round-by-round evaluations
  return ( // returns active RuleGrid JSX
    <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-5"> {/* main card container */}
      <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
        <div> {/* title group */}
          <h3 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            Rule Verification (R0–R8) {/* section heading */}
          </h3> {/* closes title */}
          <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
            Self-correcting verification of budget, physical accessibility, and timing {/* subtitle */}
          </p> {/* closes description */}
        </div> {/* closes title group */}
        <span className="text-[11px] font-medium text-lake bg-lake-soft border border-lake/30 px-2 py-0.5 rounded-full"> {/* badge */}
          {evaluatedRounds.length} round{evaluatedRounds.length === 1 ? "" : "s"} {/* round count label */}
        </span> {/* closes badge */}
      </div> {/* closes header row */}

      {/* List of evaluation rows for each round */}
      <div className="space-y-4"> {/* rounds container */}
        {evaluatedRounds.map((roundNumber) => { // iterate over each evaluated round
          // Find matching draft event to read which model planned this round
          const matchingDraft = draftEvents.find((draft) => draft.round === roundNumber); // locates draft
          // Format model name badge text
          const modelBadgeName = matchingDraft // checks draft existence
            ? shortModelName(matchingDraft.itinerary.generatedBy.model) // shortens model name
            : null; // null if draft event not yet arrived

          // Collect all rule check events for this specific round
          const roundCheckEvents = ruleCheckEvents.filter((check) => check.round === roundNumber); // filters for round
          // Map outcomes by rule ID for fast lookup
          const outcomesByRule = new Map(roundCheckEvents.map((check) => [check.outcome.ruleId, check.outcome])); // creates map

          // Render single round evaluation card
          return ( // returns round evaluation JSX
            <div // round container with fade-in transition
              key={roundNumber} // unique key per round
              className="p-3.5 rounded-xl border border-line/80 bg-sand/30 space-y-2.5 transition-opacity duration-500 ease-in" // card styling
            > {/* round inner content */}
              <div className="flex items-center justify-between"> {/* round header */}
                <div className="flex items-center gap-2"> {/* title and status group */}
                  <span className="text-xs font-bold text-ink uppercase tracking-wide"> {/* round title */}
                    Round {roundNumber} {/* round number text */}
                  </span> {/* closes round title */}
                  {modelBadgeName && ( // conditional model badge
                    <span className="text-[10px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* badge */}
                      {modelBadgeName} {/* model name display */}
                    </span> // closes model badge
                  )} {/* ends model badge conditional */}
                </div> {/* closes title group */}
              </div> {/* closes round header */}

              {/* Grid of nine rule outcome chips */}
              <div className="grid grid-cols-3 gap-1.5"> {/* 3-column chip layout */}
                {ALL_RULE_IDS.map((ruleId) => { // iterate over all nine rule definitions
                  // Read outcome for this rule in current round
                  const outcome = outcomesByRule.get(ruleId); // gets outcome or undefined
                  // Determine status string
                  const status = outcome ? outcome.status : "pending"; // status string
                  // Read tooltip note or default explanation
                  const tooltipText = outcome ? outcome.note : `${ruleId}: ${RULE_SHORT[ruleId]} pending`; // tooltip text

                  // Determine background and border styles based on rule outcome
                  let styleClasses = "border-line bg-sand/40 text-ink-soft"; // default pending styling
                  if (status === "pass") { // passing outcome styling
                    styleClasses = "border-ok/30 bg-ok/10 text-ok hover:bg-ok/20"; // green ok theme
                  } else if (status === "fail") { // failing outcome styling
                    styleClasses = "border-bad/30 bg-bad/10 text-bad hover:bg-bad/20 font-semibold"; // red bad theme
                  } else if (status === "warn") { // warning outcome styling
                    styleClasses = "border-warn/30 bg-warn/10 text-warn hover:bg-warn/20 font-semibold"; // amber warn theme
                  } else if (status === "skip") { // skipped outcome styling
                    styleClasses = "border-line/70 bg-sand/60 text-ink-soft hover:bg-sand"; // muted sand theme
                  } // ends style conditions

                  // Render individual rule chip
                  return ( // returns chip JSX
                    <div // interactive tooltip chip
                      key={ruleId} // rule key
                      title={tooltipText} // native browser tooltip with detailed rule note
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-xs transition-colors cursor-help ${styleClasses}`} // styling
                    > {/* chip contents */}
                      <span className="truncate pr-1"> {/* rule label */}
                        {ruleId} {RULE_SHORT[ruleId]} {/* R0 Data, R1 Budget, etc. */}
                      </span> {/* closes rule label */}
                      <StatusIcon status={status} /> {/* status indicator icon */}
                    </div> // closes chip
                  ); // ends return
                })} {/* ends map */}
              </div> {/* closes 3-column grid */}
            </div> // closes round evaluation card
          ); // ends return
        })} {/* ends evaluatedRounds map */}
      </div> {/* closes rounds container */}
    </div> // closes main card container
  ); // ends return
} // ends RuleGrid component
