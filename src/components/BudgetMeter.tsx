// Import React type definitions for JSX rendering
import type { JSX } from "react"; // imports JSX namespace for typing component return
// Import money formatting helper to display formatted currency values
import { money } from "../lib/format.js"; // formats minor units to localized currency strings
// Import useRun hook to access shared planning run state
import { useRun } from "../state/RunProvider.js"; // provides access to global agent run state

// Define named constant for minimum percentage value
const MIN_PERCENT_VALUE = 0; // lower bound for meter percentage calculations
// Define named constant for visual bar cap percentage
const MAX_VISUAL_PERCENT_CAP = 120; // visual cap requested at 120%
// Define named constant for percentage multiplier
const PERCENT_MULTIPLIER = 100; // multiplier to convert decimal ratio to percentage
// Define named constant for basis points divisor
const BPS_DIVISOR = 100; // divisor to convert basis points (0..10000) to percentage
// Define named constant for zero minor units threshold
const ZERO_MINOR_THRESHOLD = 0; // threshold separating over-budget and under-budget

// Intent: Render accessible BudgetMeter tracking itinerary costs against the user's budget ceiling
export function BudgetMeter(): JSX.Element { // exports BudgetMeter component
  // Retrieve current agent run state from context
  const { state } = useRun(); // reads agent state including draft and final plans

  // Extract costs breakdown from either finalized itinerary or active working draft
  const activeCosts = (state.final ?? state.draft)?.costs ?? null; // resolves current cost breakdown or null

  // Guard: render placeholder when costs have not yet been calculated by a draft
  if (!activeCosts) { // check if cost breakdown is absent
    // Render idle meter card communicating awaiting status
    return ( // returns fallback placeholder JSX
      <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-3 min-h-[148px]"> {/* card container with reserved height */}
        <div className="flex items-center justify-between"> {/* header row */}
          <span className="text-xs font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            Budget Meter {/* section title label */}
          </span> {/* closes title */}
          <span className="text-[11px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* status badge */}
            Awaiting draft {/* idle status text */}
          </span> {/* closes badge */}
        </div> {/* closes header row */}
        <div // accessible meter container
          role="meter" // ARIA role for meter
          aria-valuenow={MIN_PERCENT_VALUE} // current value is zero
          aria-valuemin={MIN_PERCENT_VALUE} // minimum allowed value
          aria-valuemax={PERCENT_MULTIPLIER} // maximum baseline value
          aria-valuetext="No draft costs available yet" // descriptive accessible text
          className="relative h-3 w-full bg-sand rounded-full overflow-hidden border border-line" // bar track styling
        > {/* empty track */}
          <div // inactive inner progress bar
            className="h-full bg-lake-soft/50 rounded-full transition-all duration-500" // smooth animated bar
            style={{ width: `${MIN_PERCENT_VALUE}%` }} // zero width style
          /> {/* closes inner bar */}
        </div> {/* closes meter container */}
        <p className="text-xs text-ink-soft"> {/* helper prompt */}
          Cost breakdown will calculate automatically when the Planner generates draft round 0. {/* explanation text */}
        </p> {/* closes helper text */}
      </div> // closes card container
    ); // ends return
  } // ends guard check

  // Extract total spent in integer minor units
  const grandTotalMinor = activeCosts.grandTotalMinor; // total itinerary expenditure
  // Extract budget limit in integer minor units
  const budgetMinor = activeCosts.budgetMinor; // user's budget limit
  // Extract remaining minor units (negative if exceeding budget)
  const remainingMinor = activeCosts.remainingMinor; // surplus or deficit
  // Extract currency code for accurate currency formatting
  const currency = activeCosts.currency; // target currency code
  // Extract basis points share of estimated provenance
  const estimateShareBps = activeCosts.estimateShareBps; // estimated portion in basis points

  // Calculate decimal ratio of spent amount relative to budget
  const spendRatio = budgetMinor > ZERO_MINOR_THRESHOLD ? grandTotalMinor / budgetMinor : MIN_PERCENT_VALUE; // avoids division by zero
  // Compute percentage value from spend ratio
  const actualPercent = spendRatio * PERCENT_MULTIPLIER; // converts to standard 0..100+ scale
  // Cap visual bar width at 120% per specification
  const visualBarPercent = Math.min(actualPercent, MAX_VISUAL_PERCENT_CAP); // visual fill capped at 120%
  // Determine if itinerary has exceeded the user's budget
  const isOverBudget = remainingMinor < ZERO_MINOR_THRESHOLD; // true when deficit occurs
  // Compute absolute deficit amount when over budget
  const overAmountMinor = Math.abs(remainingMinor); // non-negative minor units over budget

  // Format main cost summary text: "<money(total)> of <money(budget)>"
  const formattedSummary = `${money(grandTotalMinor, currency)} of ${money(budgetMinor, currency)}`; // formatted label
  // Format difference label depending on whether over or under budget
  const differenceLabel = isOverBudget // conditional label formatting
    ? `over by ${money(overAmountMinor, currency)}` // over budget text
    : `${money(remainingMinor, currency)} left`; // under budget text

  // Compute percentage formatted string for estimated provenance if greater than zero
  const estimatePercentString = (estimateShareBps / BPS_DIVISOR).toFixed(0); // integer percentage string
  // Full descriptive accessible value text for screen readers
  const accessibleValueText = `${formattedSummary}, ${differenceLabel}`; // composite accessible text

  // Render active BudgetMeter interface
  return ( // returns active meter JSX
    <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-3 min-h-[148px]"> {/* card container with reserved height */}
      <div className="flex items-center justify-between"> {/* header row */}
        <span className="text-xs font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
          Budget Meter {/* section title label */}
        </span> {/* closes title */}
        {estimateShareBps > ZERO_MINOR_THRESHOLD && ( // conditional render for estimate notice
          <span className="text-[11px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* estimate badge */}
            {estimatePercentString}% estimated {/* estimated percentage label */}
          </span> // closes badge
        )} {/* ends estimate conditional */}
      </div> {/* closes header row */}

      {/* Accessible visual meter progress track */}
      <div // accessible meter element
        role="meter" // ARIA role for meter measurement
        aria-valuenow={grandTotalMinor} // numerical value in minor units
        aria-valuemin={ZERO_MINOR_THRESHOLD} // numerical minimum bound
        aria-valuemax={budgetMinor} // numerical target budget bound
        aria-valuetext={accessibleValueText} // accessible summary text
        className="relative h-3 w-full bg-sand rounded-full overflow-hidden border border-line" // visual track container
      > {/* meter inner bar */}
        <div // dynamically styled animated fill bar
          className={`h-full rounded-full transition-all duration-500 ease-out ${ // animation classes
            isOverBudget ? "bg-bad" : "bg-lake" // bad red when over budget, trustworthy lake when within
          }`} // closes className template
          style={{ width: `${visualBarPercent}%` }} // inline width up to 120% visual cap
        /> {/* closes progress bar */}
      </div> {/* closes accessible meter element */}

      {/* Numerical status and remaining budget row */}
      <div className="flex items-center justify-between text-xs pt-0.5"> {/* status labels flex container */}
        <span className="font-semibold text-ink"> {/* formatted total and budget */}
          {formattedSummary} {/* total of budget display */}
        </span> {/* closes total and budget */}
        <span // difference indicator with semantic text color
          className={`font-semibold ${ // conditional semantic color class
            isOverBudget ? "text-bad" : "text-ok" // red for over budget, green for remaining surplus
          }`} // closes class template
        > {/* difference text */}
          {differenceLabel} {/* over by or remaining left */}
        </span> {/* closes difference indicator */}
      </div> {/* closes status labels row */}
    </div> // closes card container
  ); // ends return
} // ends BudgetMeter component
