// Import React type definitions and JSX types
import type { JSX } from "react"; // imports JSX element type
// Import helpers for model name formatting and rule labels
import { RULE_INFO, RULE_SHORT, shortModelName } from "../lib/format.js"; // UI label formatting helpers
// Import useRun hook to read agent run state and events
import { useRun } from "../state/RunProvider.js"; // global agent state provider hook
// Import shared types for RuleId, RuleOutcome, and SSEEvent
import type { RuleId, RuleOutcome, SSEEvent } from "../../types/travelverse.js"; // core travel contracts

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

// Define named constant for 3-column layout modulo calculation
const GRID_COLUMNS_COUNT = 3; // total columns in rule grid layout
// Column index constant for first column
const FIRST_COLUMN_INDEX = 0; // column 0 aligns to left edge
// Column index constant for third column
const THIRD_COLUMN_INDEX = 2; // column 2 aligns to right edge

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

// Interface defining properties accepted by RuleChip
interface RuleChipProps { // specifies RuleChip component inputs
  readonly ruleId: RuleId; // identifier for rule R0-R8
  readonly index: number; // grid position index (0 to 8) to calculate tooltip alignment
  readonly roundKey: string | number; // unique identifier for the evaluation round
  readonly outcome: RuleOutcome | undefined; // result outcome object if evaluated
  readonly status: "pass" | "fail" | "warn" | "skip" | "pending"; // evaluation status
} // ends RuleChipProps interface

// Intent: Render interactive rule chip with keyboard focus, default cursor, and accessible rich tooltip
function RuleChip({ // helper component for individual rule outcome chip
  ruleId, // rule ID parameter
  index, // column alignment index
  roundKey, // round identifier
  outcome, // outcome object
  status, // status string
}: RuleChipProps): JSX.Element { // returns JSX element
  // Lookup canonical rule name and plain explanation from RULE_INFO
  const info = RULE_INFO[ruleId]; // retrieves rule details
  // Determine plain text for this round's result note
  const resultNote = outcome // checks if outcome exists
    ? outcome.note // uses evaluation note
    : `${ruleId}: ${RULE_SHORT[ruleId]} pending evaluation`; // default pending message

  // Calculate horizontal tooltip alignment based on column index (0=left, 1=center, 2=right)
  const columnIndex = index % GRID_COLUMNS_COUNT; // modulo arithmetic for 3-column grid
  let tooltipAlignClass = "left-1/2 -translate-x-1/2"; // default centered position
  if (columnIndex === FIRST_COLUMN_INDEX) { // first column check
    tooltipAlignClass = "left-0"; // align tooltip to left edge
  } else if (columnIndex === THIRD_COLUMN_INDEX) { // third column check
    tooltipAlignClass = "right-0"; // align tooltip to right edge
  } // ends alignment logic

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

  // Tooltip element DOM ID for accessibility aria-describedby binding
  const tooltipId = `rule-tooltip-${roundKey}-${ruleId}`; // unique element ID

  // Render chip container with hover, keyboard focus, and embedded tooltip
  return ( // returns chip JSX
    <div // interactive chip container
      key={ruleId} // React key
      tabIndex={0} // enables keyboard focus via Tab key
      role="group" // accessible grouping role
      aria-label={`${ruleId} ${info.name}: ${status}. ${resultNote}`} // screen reader summary
      aria-describedby={tooltipId} // associates container with tooltip description
      className={`group relative flex items-center justify-between px-2 py-1.5 rounded-lg border text-xs transition-colors cursor-default select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake focus-visible:ring-offset-1 focus-within:z-30 hover:z-30 ${styleClasses}`} // chip styling with default cursor
    > {/* chip contents */}
      <span className="truncate pr-1"> {/* rule label */}
        {ruleId} {RULE_SHORT[ruleId]} {/* R0 Data, R1 Budget, etc. */}
      </span> {/* closes rule label */}
      <StatusIcon status={status} /> {/* status indicator icon */}

      {/* Rich accessible tooltip shown on hover and keyboard focus */}
      <div // tooltip overlay
        id={tooltipId} // matching DOM ID
        role="tooltip" // ARIA tooltip role
        className={`absolute z-40 pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 transition-all duration-150 bottom-full mb-1.5 w-64 p-3 rounded-xl bg-ink text-white text-xs shadow-2xl border border-white/10 ${tooltipAlignClass}`} // tooltip styling
      > {/* tooltip inner layout */}
        <div className="font-semibold text-sand flex items-center justify-between gap-1 pb-1.5 border-b border-white/10"> {/* tooltip header */}
          <span>{ruleId}: {info.name}</span> {/* rule canonical name */}
          <span className="text-[10px] uppercase font-mono tracking-wider opacity-80">{status}</span> {/* status badge */}
        </div> {/* closes tooltip header */}
        <p className="text-[11px] text-white/80 pt-1.5 leading-snug"> {/* rule check description */}
          {info.description} {/* plain sentence on what it checks */}
        </p> {/* closes rule check description */}
        <div className="text-[11px] text-sand/95 pt-2 border-t border-white/10 mt-2 font-medium leading-snug"> {/* round result container */}
          <span className="text-white/60 font-normal">This round: </span> {/* result prefix label */}
          {resultNote} {/* this round's result note */}
        </div> {/* closes round result container */}
      </div> {/* closes tooltip overlay */}
    </div> // closes interactive chip container
  ); // ends return
} // ends RuleChip helper component

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

  // Determine if final checks should be displayed from finalized or chosen plan
  const hasFinalChecks = Boolean( // checks if final itinerary validation is available
    state.final && ( // final plan must exist
      state.chosenOption !== null || // user explicitly picked trade-off option in 'Your call'
      evaluatedRounds.length === EMPTY_COLLECTION_COUNT // or no rounds were evaluated yet (e.g. fast trade-off)
    ),
  ); // ends hasFinalChecks

  // Map final plan outcomes by rule ID for fast lookup
  const finalOutcomesByRule = state.final // check if final itinerary exists
    ? new Map(state.final.validation.outcomes.map((check) => [check.ruleId, check])) // creates lookup map
    : null; // null if no final itinerary

  // Render idle hero view only when planning has not yet executed rule checks and no final checks exist
  if (evaluatedRounds.length === EMPTY_COLLECTION_COUNT && !hasFinalChecks) { // check if completely idle
    return ( // returns idle state JSX
      <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-4 min-h-[196px]"> {/* card container with reserved height */}
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
          {ALL_RULE_IDS.map((ruleId, index) => ( // iterate over all rule ids
            <RuleChip // renders rule chip for standby preview
              key={ruleId} // React key
              ruleId={ruleId} // rule identifier
              index={index} // column index for tooltip placement
              roundKey="standby" // standby round identifier
              outcome={undefined} // no outcome yet in standby
              status="pending" // pending status
            /> // closes RuleChip
          ))} {/* ends map */}
        </div> {/* closes grid */}
      </div> // closes card container
    ); // ends return
  } // ends empty rounds condition

  // Render active RuleGrid with round-by-round evaluations
  return ( // returns active RuleGrid JSX
    <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-5 min-h-[196px]"> {/* main card container with reserved height */}
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
          {hasFinalChecks // check if final checks present
            ? evaluatedRounds.length > EMPTY_COLLECTION_COUNT // check if prior rounds also exist
              ? `${evaluatedRounds.length} round${evaluatedRounds.length === 1 ? "" : "s"} + Final` // round count plus final
              : "Final checks" // only final checks
            : `${evaluatedRounds.length} round${evaluatedRounds.length === 1 ? "" : "s"}`} {/* standard round count label */}
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
                  {state.final && !state.chosenOption && roundNumber === state.final.round && state.final.validation.passed && ( // final round badge for regular finalized run
                    <span className="text-[10px] font-semibold text-ok bg-ok/10 border border-ok/30 px-2 py-0.5 rounded-full flex items-center gap-1"> {/* badge */}
                      <StatusIcon status="pass" /> Finalized {/* finalized label */}
                    </span> // closes badge
                  )} {/* ends final round conditional */}
                </div> {/* closes title group */}
              </div> {/* closes round header */}

              {/* Grid of nine rule outcome chips */}
              <div className="grid grid-cols-3 gap-1.5"> {/* 3-column chip layout */}
                {ALL_RULE_IDS.map((ruleId, index) => { // iterate over all nine rule definitions
                  // Read outcome for this rule in current round
                  const outcome = outcomesByRule.get(ruleId); // gets outcome or undefined
                  // Determine status string
                  const status = outcome ? outcome.status : "pending"; // status string

                  // Render individual rule chip using RuleChip component
                  return ( // returns RuleChip JSX
                    <RuleChip // renders rule outcome chip with rich tooltip
                      key={ruleId} // rule key
                      ruleId={ruleId} // rule identifier
                      index={index} // column index for tooltip placement
                      roundKey={roundNumber} // round number identifier
                      outcome={outcome} // evaluated outcome
                      status={status} // current status
                    /> // closes RuleChip
                  ); // ends return
                })} {/* ends map */}
              </div> {/* closes 3-column grid */}
            </div> // closes round evaluation card
          ); // ends return
        })} {/* ends evaluatedRounds map */}

        {/* Final checks evaluation card representing chosen tradeoff option or final plan */}
        {hasFinalChecks && state.final && finalOutcomesByRule && ( // conditional final checks card
          <div // final checks card container with distinctive highlight styling
            key="final-checks" // unique React key
            className="p-3.5 rounded-xl border border-ok/40 bg-ok/5 space-y-2.5 transition-opacity duration-500 ease-in" // card styling
          > {/* inner content */}
            <div className="flex items-center justify-between"> {/* header row */}
              <div className="flex items-center gap-2"> {/* title and status group */}
                <span className="text-xs font-bold text-ink uppercase tracking-wide"> {/* title */}
                  {state.chosenOption ? `Final Checks (Option ${state.chosenOption})` : "Final Checks"} {/* context-aware title */}
                </span> {/* closes title */}
                {state.chosenOption && ( // choice indicator badge
                  <span className="text-[10px] font-semibold text-white bg-lake px-2 py-0.5 rounded-full shadow-xs"> {/* badge */}
                    Option {state.chosenOption} {/* option pill */}
                  </span> // closes badge
                )} {/* ends choice indicator */}
                <span className="text-[10px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* badge */}
                  {shortModelName(state.final.generatedBy.model)} {/* model name */}
                </span> {/* closes badge */}
              </div> {/* closes title group */}
              {state.final.validation.passed ? ( // passing status badge check
                <span className="text-[10px] font-semibold text-ok bg-ok/10 border border-ok/30 px-2 py-0.5 rounded-full flex items-center gap-1"> {/* badge */}
                  <StatusIcon status="pass" /> Passed {/* passing status text */}
                </span> // closes badge
              ) : ( // non-passing or warn status badge
                <span className="text-[10px] font-semibold text-warn bg-warn/10 border border-warn/30 px-2 py-0.5 rounded-full flex items-center gap-1"> {/* badge */}
                  <StatusIcon status="warn" /> Verified {/* verified label */}
                </span> // closes badge
              )} {/* ends status badge condition */}
            </div> {/* closes header row */}

            {/* Grid of nine rule outcome chips for the final plan */}
            <div className="grid grid-cols-3 gap-1.5"> {/* 3-column chip layout */}
              {ALL_RULE_IDS.map((ruleId, index) => { // iterate over all nine rule definitions
                // Read outcome for this rule in final plan
                const outcome = finalOutcomesByRule.get(ruleId); // gets outcome or undefined
                // Determine status string
                const status = outcome ? outcome.status : "pending"; // status string

                // Render individual rule chip for final plan using RuleChip component
                return ( // returns RuleChip JSX
                  <RuleChip // renders final rule outcome chip with rich tooltip
                    key={ruleId} // rule key
                    ruleId={ruleId} // rule identifier
                    index={index} // column index for tooltip placement
                    roundKey="final" // final round identifier
                    outcome={outcome} // evaluated final outcome
                    status={status} // final status
                  /> // closes RuleChip
                ); // ends return
              })} {/* ends map */}
            </div> {/* closes 3-column grid */}
          </div> // closes final checks card
        )} {/* ends hasFinalChecks conditional */}
      </div> {/* closes rounds container */}
    </div> // closes main card container
  ); // ends return
} // ends RuleGrid component
