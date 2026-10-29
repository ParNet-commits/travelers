// Import React core hooks, event types, and JSX namespace
import { useState, type JSX, type KeyboardEvent } from "react"; // React primitives for local UI state and events
// Import shared contracts from travelverse schema
import type { // imports types from single source of truth
  CostBreakdown, // overall cost breakdown schema
  CostCategory, // category union for cost classification
  CostLine, // line item record for cost breakdown
  ItineraryItem, // union of visit, transit, meal, and rest items
  PricedAmount, // monetary amount with provenance and currency
  StepFreeStatus, // accessibility rating enum
  TransitItem, // transit travel segment item
  ValidationReport, // report containing rule validation outcomes
  Violation, // violation record for rule checks
  VisitItem, // venue stop visit item
} from "../../types/travelverse.js"; // shared domain contracts
// Import curated FX table containing actual USD exchange rates
import { FX_TABLE } from "../../server/data/fx.js"; // single source of truth for foreign exchange rates
// Import UI formatting helpers for currency, provenance, accessibility, and packing tips
import { // imports display formatting helpers
  computePackingTip, // computes day packing tip from weather forecast
  formatPlannerDayNumbers, // humanizes 0-indexed day numbers in text
  money, // formats integer minor units to currency strings
  provenanceLabel, // provides human-readable data source labels
  STEP_FREE_LABEL, // maps step-free status enum to user-facing strings
} from "../lib/format.js"; // centralized display helpers
// Import run context hook to access global agent planning state
import { useRun } from "../state/RunProvider.js"; // global agent state provider hook
// Import AccessibilityAudit component to display step-free verification stats and citations
import { AccessibilityAudit } from "./AccessibilityAudit.js"; // accessibility audit badge and source citations

// Define named constant for zero minor units
const ZERO_MINOR_UNITS = 0; // baseline minor currency value
// Define named constant for single item count
const SINGLE_ITEM_COUNT = 1; // used for singular vs plural text
// Define named constant for first index in an array
const FIRST_ARRAY_INDEX = 0; // array initial offset index
// Define named constant for increment offset to convert 0-indexed to 1-indexed
const ONE_BASED_OFFSET = 1; // offset for day number labels
// Define named constant for index offset moving backward
const PREV_INDEX_OFFSET = -1; // shift step left
// Define named constant for index offset moving forward
const NEXT_INDEX_OFFSET = 1; // shift step right

// Define named constant list of cost category metadata in presentation order
const COST_CATEGORY_ORDER: readonly { id: CostCategory; label: string }[] = [ // array of cost categories
  { id: "lodging", label: "Stay" }, // lodging and accommodation category
  { id: "meals", label: "Meals" }, // food and dining category
  { id: "tickets", label: "Tickets" }, // entry tickets and admission category
  { id: "local_transport", label: "Local transport" }, // in-destination taxis and transit category
  { id: "arrival", label: "Getting there" }, // inbound and outbound long-distance travel category
]; // ends COST_CATEGORY_ORDER definition

// Define component props interface for ItineraryView
export interface ItineraryViewProps { // public props interface
  // Optional callback invoked when the user selects a place's accessibility chip
  onOpenEvidence?: (placeId: string) => void; // callback handler for opening EvidenceDrawer (P15)
} // ends ItineraryViewProps interface

// Intent: Format ISO date string into readable "Mon 16 Nov" format using UTC
function formatDayDate(isoDate: string): string { // helper date formatting function
  // Short weekday abbreviations in UTC order (0 = Sun, 6 = Sat)
  const DAYS: readonly string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // day names array
  // Short month abbreviations in UTC order (0 = Jan, 11 = Dec)
  const MONTHS: readonly string[] = [ // month names array
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", // first half of year
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", // second half of year
  ]; // ends months array
  // Parse ISO date with explicit UTC midnight timestamp
  const dateObj = new Date(`${isoDate}T00:00:00Z`); // UTC date instance
  // Resolve weekday string from UTC day of week
  const weekday = DAYS[dateObj.getUTCDay()] ?? ""; // weekday abbreviation
  // Resolve numeric calendar day of month
  const dayOfMonth = dateObj.getUTCDate(); // day number
  // Resolve month name string from UTC month
  const month = MONTHS[dateObj.getUTCMonth()] ?? ""; // month abbreviation
  // Return composite string "Mon 16 Nov"
  return `${weekday} ${dayOfMonth} ${month}`; // returns combined date label
} // ends formatDayDate

// Intent: Format start and end date range into a concise human-readable string
function formatDateRange(startDateIso: string, endDateIso: string): string { // helper date range formatter
  // Format starting calendar date
  const startFormatted = formatDayDate(startDateIso); // formats start date
  // Format ending calendar date
  const endFormatted = formatDayDate(endDateIso); // formats end date
  // Extract four-digit year from start date string
  const yearString = startDateIso.slice(0, 4); // extracts calendar year
  // Return formatted range with year
  return `${startFormatted} – ${endFormatted} ${yearString}`; // returns range label
} // ends formatDateRange

// Intent: Render interactive CostChip showing formatted amount with hover/focus popover
function CostChip({ // helper component for price chips
  cost, // converted party cost in budget currency
  costOriginal, // original cost in local source currency
}: { // props specification
  cost: PricedAmount; // party total in budget currency
  costOriginal?: PricedAmount; // party total in source currency
}): JSX.Element { // returns JSX element
  // Local state to toggle popover visibility on hover or focus
  const [isOpen, setIsOpen] = useState<boolean>(false); // popover open state
  // Check if cost originates from an estimate
  const isEstimate = cost.provenance === "estimate"; // boolean check for estimate provenance
  // Check if original currency or amount differs from converted amount
  const hasDistinctOriginal = // boolean check for distinct original cost
    costOriginal && // original cost must be present
    (costOriginal.currency !== cost.currency || costOriginal.amountMinor !== cost.amountMinor); // distinct check

  // Format primary price in user budget currency
  const formattedPrimaryAmount = money(cost.amountMinor, cost.currency); // localized cost string
  // Resolve provenance badge label
  const provenanceText = provenanceLabel(cost); // human-readable label

  // Render cost chip with accessible hover and focus handlers
  return ( // returns chip JSX
    <span // outer container for relative popover positioning
      className="relative inline-flex items-center" // inline layout
      onMouseEnter={() => setIsOpen(true)} // opens popover on mouse enter
      onMouseLeave={() => setIsOpen(false)} // closes popover on mouse leave
    > {/* chip trigger and popover */}
      {/* Interactive button element reachable via keyboard tab */}
      <button // accessible button trigger
        type="button" // standard button type
        aria-haspopup="dialog" // indicates popup dialog behavior
        aria-expanded={isOpen} // announces popup expansion state
        onFocus={() => setIsOpen(true)} // opens popover on focus
        onBlur={() => setIsOpen(false)} // closes popover on blur
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-sand/80 border border-line text-ink transition-colors cursor-pointer hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${ // base styling
          isEstimate ? "underline decoration-dotted underline-offset-2" : "" // dotted underline for estimates
        }`} // closes class list
      > {/* button label */}
        <span>{formattedPrimaryAmount}</span> {/* primary money value */}
        {isEstimate ? ( // condition for estimate label
          <span className="text-[10px] text-ink-soft font-normal">(Estimated)</span> // estimate indicator
        ) : null} {/* ends condition */}
      </button> {/* closes button trigger */}

      {/* Popover overlay rendered when isOpen is true */}
      {isOpen ? ( // conditional popover rendering
        <span // popover panel container
          role="dialog" // dialog role for accessibility
          aria-label="Cost provenance and exchange details" // accessible name
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 w-64 p-3 bg-ink text-sand rounded-xl shadow-xl text-xs space-y-1.5 pointer-events-auto" // popover styling
        > {/* popover card content */}
          {/* Popover header with primary amount */}
          <span className="block font-semibold text-white"> {/* title wrapper */}
            {formattedPrimaryAmount} {/* primary amount */}
            {isEstimate ? <span className="ml-1 text-[11px] text-marigold font-normal">(Estimated)</span> : null} {/* estimate badge */}
          </span> {/* closes title wrapper */}

          {/* Original local amount when different from budget currency */}
          {hasDistinctOriginal && costOriginal ? ( // conditional original cost row
            <span className="block text-sand/80"> {/* original cost line */}
              <span className="text-sand/60">Original: </span> {/* prefix */}
              {money(costOriginal.amountMinor, costOriginal.currency)} {/* formatted original amount */}
            </span> // closes original cost line
          ) : null} {/* ends condition */}

          {/* Data provenance source label */}
          <span className="block text-sand/80"> {/* provenance line */}
            <span className="text-sand/60">Source: </span> {/* prefix */}
            {provenanceText} {/* provenance description */}
          </span> {/* closes provenance line */}

          {/* Data retrieval date if present */}
          {cost.asOf ? ( // conditional as-of date check
            <span className="block text-sand/70 text-[11px]"> {/* as-of line */}
              as of {cost.asOf} {/* date text */}
            </span> // closes as-of line
          ) : null} {/* ends condition */}

          {/* Optional context note explaining the price */}
          {cost.note ? ( // conditional note check
            <span className="block text-sand/70 text-[11px] leading-snug"> {/* note text */}
              {cost.note} {/* note string */}
            </span> // closes note text
          ) : null} {/* ends condition */}

          {/* Source link when URL is available */}
          {cost.sourceUrl ? ( // conditional source link check
            <span className="block pt-1 border-t border-sand/20"> {/* link container */}
              <a // external web reference link
                href={cost.sourceUrl} // target URL
                target="_blank" // open in new tab
                rel="noopener noreferrer" // secure external link attributes
                className="text-lake-soft underline hover:text-white transition-colors" // link styling
              > {/* link label */}
                Verify source ↗ {/* link text */}
              </a> {/* closes link */}
            </span> // closes link container
          ) : null} {/* ends condition */}
        </span> // closes popover panel
      ) : null} {/* ends conditional popover rendering */}
    </span> // closes outer container
  ); // ends return
} // ends CostChip component

// Intent: Render StepFreeChip indicating step-free accessibility with icon, status text, and click handler
function StepFreeChip({ // helper component for step-free badges
  stepFree, // accessibility status enum
  placeId, // identifier of the place to inspect
  onOpenEvidence, // optional click callback to open evidence drawer
}: { // props specification
  stepFree: StepFreeStatus; // step-free rating
  placeId: string; // target place id
  onOpenEvidence?: (placeId: string) => void; // callback handler
}): JSX.Element { // returns JSX element
  // Resolve readable label from lookup dictionary
  const label = STEP_FREE_LABEL[stepFree] ?? "Unverified"; // human-readable status string

  // Render checkmark icon for fully step-free status
  const renderIcon = () => { // helper icon switch function
    if (stepFree === "step_free") { // full accessibility check
      return ( // returns checkmark SVG
        <svg className="w-3.5 h-3.5 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
        </svg> // closes SVG
      ); // ends checkmark return
    } // ends step_free check
    if (stepFree === "partial") { // partial accessibility check
      return ( // returns alert triangle SVG
        <svg className="w-3.5 h-3.5 shrink-0 text-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> {/* alert shape */}
        </svg> // closes SVG
      ); // ends partial return
    } // ends partial check
    if (stepFree === "not_step_free") { // not accessible check
      return ( // returns prohibited slash SVG
        <svg className="w-3.5 h-3.5 shrink-0 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /> {/* slash circle shape */}
        </svg> // closes SVG
      ); // ends not_step_free return
    } // ends not_step_free check
    // Default fallback: question circle for unverified status
    return ( // returns question mark SVG
      <svg className="w-3.5 h-3.5 shrink-0 text-ink-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> {/* question circle */}
      </svg> // closes SVG
    ); // ends unverified return
  }; // ends renderIcon

  // Resolve color scheme classes based on step-free status
  let colorClasses = "bg-sand text-ink-soft border-line hover:bg-sand/80"; // default grey unverified colors
  if (stepFree === "step_free") { // step_free green
    colorClasses = "bg-ok/10 text-ok border-ok/30 hover:bg-ok/20"; // green styling
  } else if (stepFree === "partial") { // partial amber
    colorClasses = "bg-warn/10 text-warn border-warn/30 hover:bg-warn/20"; // amber styling
  } else if (stepFree === "not_step_free") { // not_step_free red
    colorClasses = "bg-bad/10 text-bad border-bad/30 hover:bg-bad/20"; // red styling
  } // ends color conditions

  // Render chip as interactive accessible button
  return ( // returns chip JSX
    <button // button element
      type="button" // standard button type
      onClick={() => onOpenEvidence?.(placeId)} // invokes evidence drawer callback
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${colorClasses}`} // button styling
      title="Click to view accessibility evidence" // browser tooltip
      aria-label={`Accessibility status: ${label}. Click to view evidence.`} // accessible description
    > {/* chip contents */}
      {renderIcon()} {/* status icon */}
      <span>{label}</span> {/* readable text label */}
    </button> // closes button
  ); // ends return
} // ends StepFreeChip component

// Intent: Render single itinerary item row handling visit, transit, meal, and rest item variations
function ItineraryItemRow({ // helper component for timeline items
  item, // itinerary item union
  onOpenEvidence, // evidence drawer callback handler
}: { // props specification
  item: ItineraryItem; // polymorphic itinerary item
  onOpenEvidence?: (placeId: string) => void; // evidence callback handler
}): JSX.Element { // returns JSX element
  // Handle visit items (attractions, landmarks, venues)
  if (item.kind === "visit") { // checks for visit item kind
    const visit = item as VisitItem; // typecast to VisitItem
    return ( // returns visit row JSX
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-line hover:border-lake/30 transition-all shadow-xs"> {/* card row */}
        {/* Left side: Time range, place name, and category badge */}
        <div className="flex items-start sm:items-center gap-3 min-w-0"> {/* left column container */}
          {/* Time range label */}
          <span className="shrink-0 text-xs font-mono font-medium text-ink-soft bg-sand px-2 py-1 rounded-md border border-line"> {/* time pill */}
            {visit.start}–{visit.end} {/* time interval */}
          </span> {/* closes time pill */}
          {/* Place name and category chip */}
          <div className="min-w-0 flex flex-wrap items-center gap-2"> {/* place name wrapper */}
            <span className="text-sm font-semibold text-ink truncate"> {/* place name */}
              {visit.name} {/* venue title */}
            </span> {/* closes name */}
            <span className="text-[11px] font-medium text-ink-soft bg-sand px-2 py-0.5 rounded-md border border-line capitalize"> {/* category badge */}
              {visit.category} {/* category label */}
            </span> {/* closes category badge */}
          </div> {/* closes place name wrapper */}
        </div> {/* closes left container */}

        {/* Right side: Accessibility step-free chip and cost chip */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto"> {/* right container */}
          <StepFreeChip // step-free verification badge
            stepFree={visit.stepFree} // step-free status
            placeId={visit.placeId} // target venue id
            onOpenEvidence={onOpenEvidence} // callback handler
          /> {/* closes StepFreeChip */}
          <CostChip // cost breakdown chip
            cost={visit.cost} // converted party cost
            costOriginal={visit.costOriginal} // original source cost
          /> {/* closes CostChip */}
        </div> {/* closes right container */}
      </div> // closes card row
    ); // ends visit return
  } // ends visit branch

  // Handle transit items (walking or taxi segments)
  if (item.kind === "transit") { // checks for transit item kind
    const transit = item as TransitItem; // typecast to TransitItem
    // Capitalize transit mode name ("Taxi" or "Walk")
    const modeLabel = transit.mode === "taxi" ? "Taxi" : "Walk"; // mode display string
    // Format distance with single decimal precision
    const distanceFormatted = transit.distanceKm.toFixed(1); // distance in km
    // Check if transit segment incurs a positive cost
    const hasTransitCost = transit.cost.amountMinor > ZERO_MINOR_UNITS; // cost presence check
    // Format monetary cost string if positive
    const transitCostString = hasTransitCost ? money(transit.cost.amountMinor, transit.cost.currency) : ""; // cost string

    return ( // returns transit line JSX
      <div className="flex items-center gap-2.5 py-1.5 px-3 text-xs text-ink-soft"> {/* transit line */}
        {/* Subtle connector indicator line and dot */}
        <div className="w-1.5 h-1.5 rounded-full bg-line shrink-0" /> {/* circular dot */}
        {/* Transit description */}
        <span className="font-medium text-ink/80"> {/* text span */}
          {modeLabel} {distanceFormatted} km, {transit.durationMin} min {/* distance and duration */}
          {hasTransitCost ? ` – ${transitCostString}` : ""} {/* cost suffix */}
        </span> {/* closes text span */}
      </div> // closes transit line
    ); // ends transit return
  } // ends transit branch

  // Handle meal items (scheduled lunch)
  if (item.kind === "meal") { // checks for meal item kind
    return ( // returns meal card JSX
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-marigold-soft/40 border border-marigold/30 text-ink"> {/* meal card */}
        <div className="flex items-center gap-3"> {/* left meal contents */}
          <span className="shrink-0 text-xs font-mono font-medium text-ink-soft bg-sand px-2 py-1 rounded-md border border-line"> {/* time pill */}
            {item.start}–{item.end} {/* meal time */}
          </span> {/* closes time pill */}
          <div className="flex items-center gap-2"> {/* label container */}
            <span className="text-base" role="img" aria-label="Meal">🍽️</span> {/* food icon */}
            <span className="text-sm font-semibold text-ink font-display"> {/* title */}
              {item.label} {/* "Lunch" */}
            </span> {/* closes title */}
          </div> {/* closes label container */}
        </div> {/* closes left contents */}
        <span className="text-xs text-ink-soft italic"> {/* meal note */}
          Included in meal budget {/* budget note */}
        </span> {/* closes note */}
      </div> // closes meal card
    ); // ends meal return
  } // ends meal branch

  // Handle rest items (relaxation break)
  if (item.kind === "rest") { // checks for rest item kind
    return ( // returns rest card JSX
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-lake-soft/40 border border-lake/20 text-ink"> {/* rest card */}
        <div className="flex items-center gap-3"> {/* left rest contents */}
          <span className="shrink-0 text-xs font-mono font-medium text-ink-soft bg-sand px-2 py-1 rounded-md border border-line"> {/* time pill */}
            {item.start}–{item.end} {/* rest time */}
          </span> {/* closes time pill */}
          <div className="flex items-center gap-2"> {/* reason container */}
            <span className="text-base" role="img" aria-label="Rest break">☕</span> {/* break icon */}
            <span className="text-sm font-medium text-ink"> {/* reason text */}
              {item.reason} {/* reason for rest */}
            </span> {/* closes reason text */}
          </div> {/* closes reason container */}
        </div> {/* closes left contents */}
        <span className="text-[11px] font-medium text-lake uppercase tracking-wider"> {/* pacing badge */}
          Pacing break {/* break badge */}
        </span> {/* closes badge */}
      </div> // closes rest card
    ); // ends rest return
  } // ends rest branch

  // Fallback return for unhandled item types
  return <div />; // empty placeholder
} // ends ItineraryItemRow component

// Intent: Render Costs accordion grouping lines with subtotals, grand total, and FX details
function CostsAccordion({ // helper component for cost breakdown
  costs, // cost breakdown data object
}: { // props specification
  costs: CostBreakdown; // CostBreakdown type
}): JSX.Element { // returns JSX element
  // Local state managing whether the accordion section is expanded
  const [isOpen, setIsOpen] = useState<boolean>(true); // accordion expansion state

  // Extract currency code
  const currency = costs.currency; // target currency
  // Extract grand total in minor units
  const grandTotalMinor = costs.grandTotalMinor; // grand total minor units
  // Extract remaining minor units (negative indicates deficit)
  const remainingMinor = costs.remainingMinor; // remaining budget minor units
  // Boolean flag indicating if spending exceeds budget limit
  const isOverBudget = remainingMinor < ZERO_MINOR_UNITS; // deficit check

  // Render accordion container
  return ( // returns accordion JSX
    <div className="bg-card border border-line rounded-2xl shadow-sm overflow-hidden"> {/* outer card */}
      {/* Accordion toggle header button */}
      <button // clickable header toggle button
        type="button" // standard button type
        onClick={() => setIsOpen(!isOpen)} // toggles open state
        aria-expanded={isOpen} // ARIA expanded attribute
        className="w-full flex items-center justify-between p-5 bg-card hover:bg-sand/40 transition-colors text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // header styling
      > {/* header contents */}
        <div className="flex items-center gap-3"> {/* title and summary */}
          <h4 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            Costs Breakdown {/* section heading */}
          </h4> {/* closes title */}
          <span className="text-xs font-semibold text-ink px-2 py-0.5 rounded-full bg-sand border border-line"> {/* grand total pill */}
            Total: {money(grandTotalMinor, currency)} {/* formatted grand total */}
          </span> {/* closes total pill */}
          {isOverBudget ? ( // over budget conditional indicator
            <span className="text-xs font-semibold text-bad px-2 py-0.5 rounded-full bg-bad/10 border border-bad/20"> {/* over badge */}
              Over by {money(Math.abs(remainingMinor), currency)} {/* deficit amount */}
            </span> // closes over badge
          ) : ( // within budget indicator
            <span className="text-xs font-semibold text-ok px-2 py-0.5 rounded-full bg-ok/10 border border-ok/20"> {/* remaining badge */}
              Remaining {money(remainingMinor, currency)} {/* surplus amount */}
            </span> // closes remaining badge
          )} {/* ends budget condition */}
        </div> {/* closes title and summary */}

        {/* Chevron icon indicating toggle state */}
        <svg // chevron SVG
          className={`w-4 h-4 text-ink-soft transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} // rotational transform
          fill="none" // no fill
          viewBox="0 0 24 24" // viewBox
          stroke="currentColor" // stroke uses text color
          strokeWidth={2} // stroke width
          aria-hidden="true" // hides from screen readers
        > {/* path definition */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /> {/* chevron down */}
        </svg> {/* closes chevron SVG */}
      </button> {/* closes header toggle */}

      {/* Accordion collapsible body */}
      {isOpen ? ( // conditional body rendering
        <div className="p-5 pt-0 border-t border-line/60 space-y-5"> {/* collapsible body */}
          {/* Category breakdown groups */}
          <div className="space-y-4 pt-4"> {/* categories list */}
            {COST_CATEGORY_ORDER.map((category) => { // iterate through defined categories
              // Filter cost lines belonging to current category
              const linesForCategory = (costs.lines as CostLine[]).filter( // filter lines
                (line) => line.category === category.id, // category match condition
              ); // ends filter
              // Extract category subtotal directly from server totalsMinor dictionary
              const subtotalMinor = costs.totalsMinor[category.id] ?? ZERO_MINOR_UNITS; // deterministic subtotal

              // Render category card with subtotal and individual items
              return ( // returns category group JSX
                <div key={category.id} className="p-3.5 rounded-xl bg-sand/30 border border-line space-y-2"> {/* category box */}
                  <div className="flex items-center justify-between text-xs font-semibold text-ink"> {/* category header */}
                    <span className="font-display tracking-wide">{category.label}</span> {/* category title */}
                    <span>{money(subtotalMinor, currency)}</span> {/* category subtotal */}
                  </div> {/* closes category header */}

                  {/* Individual line items */}
                  {linesForCategory.length > 0 ? ( // checks if lines exist
                    <div className="space-y-1.5 pl-2 border-l-2 border-line"> {/* lines list */}
                      {linesForCategory.map((line, idx) => ( // iterate over lines
                        <div key={`${line.label}-${idx}`} className="flex items-center justify-between text-xs text-ink-soft"> {/* line row */}
                          <span className="truncate pr-2">{line.label}</span> {/* line label */}
                          <span className="shrink-0 font-medium text-ink"> {/* line amount */}
                            {money(line.amount.amountMinor, line.amount.currency)} {/* formatted line cost */}
                          </span> {/* closes line amount */}
                        </div> // closes line row
                      ))} {/* ends lines map */}
                    </div> // closes lines list
                  ) : ( // no items in category
                    <p className="text-xs text-ink-soft italic pl-2">No expenses in this category</p> // empty note
                  )} {/* ends condition */}
                </div> // closes category box
              ); // ends category return
            })} {/* ends category map */}
          </div> {/* closes categories list */}

          {/* Grand total and balance summary footer */}
          <div className="p-4 rounded-xl bg-sand border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"> {/* summary box */}
            <div className="space-y-1"> {/* totals block */}
              <div className="flex items-center gap-2"> {/* grand total row */}
                <span className="font-medium text-ink-soft">Grand Total:</span> {/* label */}
                <span className="font-semibold text-ink text-sm">{money(grandTotalMinor, currency)}</span> {/* grand total value */}
              </div> {/* closes grand total row */}
              <div className="flex items-center gap-2"> {/* balance row */}
                <span className="font-medium text-ink-soft">Balance:</span> {/* label */}
                {isOverBudget ? ( // over budget message
                  <span className="font-semibold text-bad"> {/* deficit text */}
                    Over budget by {money(Math.abs(remainingMinor), currency)} {/* deficit value */}
                  </span> // closes deficit text
                ) : ( // within budget message
                  <span className="font-semibold text-ok"> {/* surplus text */}
                    Remaining {money(remainingMinor, currency)} under budget {/* surplus value */}
                  </span> // closes surplus text
                )} {/* ends condition */}
              </div> {/* closes balance row */}
            </div> {/* closes totals block */}

            {/* Foreign exchange metadata notice with actual exchange rate from FX_TABLE */}
            {costs.fx ? (() => { // conditional FX notice check
              // Extract USD to INR rate from FX_TABLE and format to 2 decimal places
              const usdInrRate = parseFloat(FX_TABLE.perUsd.INR).toFixed(2); // formatted rate string "94.75"
              // Parse asOf ISO date into UK formatted string e.g. "16 Oct 2026"
              const fxDateFormatted = new Date(`${costs.fx.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { // format to British date
                day: "numeric", // day of month e.g. 16
                month: "short", // short month name e.g. Oct
                year: "numeric", // full year e.g. 2026
              }); // ends fxDateFormatted
              // Strip trailing daily close from source string to leave clean source name
              const fxCleanSource = costs.fx.source.replace(/\s+daily\s+close/i, ""); // "Pound Sterling Live"
              // Construct exact required exchange rate display string
              const fxDisplayLabel = `Exchange rate: 1 USD = ₹${usdInrRate} (as of ${fxDateFormatted}, source: ${fxCleanSource})`; // composite FX label

              return ( // returns FX label block
                <div className="text-[11px] text-ink-soft sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-line"> {/* FX block */}
                  <span>{fxDisplayLabel}</span> {/* formatted exchange rate notice */}
                </div> // closes FX block
              ); // ends return
            })() : null} {/* ends condition */}
          </div> {/* closes summary box */}
        </div> // closes collapsible body
      ) : null} {/* ends condition */}
    </div> // closes outer card
  ); // ends return
} // ends CostsAccordion component

// Intent: Render Checks panel showing hard violations (or "All hard rules pass") and soft warnings
function ChecksPanel({ // helper component for validation rules
  validation, // validation report object
}: { // props specification
  validation: ValidationReport; // ValidationReport type
}): JSX.Element { // returns JSX element
  // Filter hard rule violations from report
  const hardViolations = validation.violations.filter( // filter violations
    (v: Violation) => v.severity === "hard", // match hard severity
  ); // ends filter
  // Filter soft rule warnings from report
  const softViolations = validation.violations.filter( // filter violations
    (v: Violation) => v.severity === "soft", // match soft severity
  ); // ends filter

  // Check if all hard rules passed
  const hasZeroHardViolations = hardViolations.length === ZERO_MINOR_UNITS; // boolean flag for hard rule success

  // Render checks panel
  return ( // returns checks panel JSX
    <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-4"> {/* panel card */}
      {/* Header with section title */}
      <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
        <h4 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
          Rule Verification Checks {/* heading text */}
        </h4> {/* closes title */}
        <span className="text-xs text-ink-soft font-medium"> {/* round indicator */}
          Validation Round {validation.round} {/* round number */}
        </span> {/* closes round indicator */}
      </div> {/* closes header row */}

      {/* Hard rules section */}
      <div className="space-y-2"> {/* hard rules container */}
        <span className="text-xs font-semibold text-ink tracking-wide block"> {/* subtitle */}
          Hard Constraints {/* section title */}
        </span> {/* closes subtitle */}

        {hasZeroHardViolations ? ( // condition for all hard rules passing
          <div className="flex items-center gap-2 p-3 rounded-xl bg-ok/10 border border-ok/30 text-ok text-xs font-medium"> {/* success banner */}
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
            </svg> {/* closes SVG */}
            <span>All hard rules pass</span> {/* success message */}
          </div> // closes success banner
        ) : ( // render list of hard rule failures
          <div className="space-y-2"> {/* violations list */}
            {hardViolations.map((violation: Violation, idx: number) => ( // iterate over hard violations
              <div // violation card
                key={`hard-${violation.code}-${idx}`} // React key
                className="flex items-start gap-2.5 p-3 rounded-xl bg-bad/10 border border-bad/30 text-bad text-xs" // card styling
              > {/* violation contents */}
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> {/* cross shape */}
                </svg> {/* closes SVG */}
                <div> {/* message container */}
                  <span className="font-semibold uppercase mr-1">[{violation.ruleId}]</span> {/* rule identifier */}
                  <span>{violation.message}</span> {/* violation details */}
                </div> {/* closes message container */}
              </div> // closes violation card
            ))} {/* ends hard map */}
          </div> // closes violations list
        )} {/* ends condition */}
      </div> {/* closes hard rules container */}

      {/* Soft warnings section (rendered only if soft violations exist) */}
      {softViolations.length > ZERO_MINOR_UNITS ? ( // condition for soft violations
        <div className="space-y-2 pt-2 border-t border-line/60"> {/* soft warnings container */}
          <span className="text-xs font-semibold text-ink-soft tracking-wide block"> {/* subtitle */}
            Soft Advisories ({softViolations.length}) {/* advisory count */}
          </span> {/* closes subtitle */}
          <div className="space-y-2"> {/* advisories list */}
            {softViolations.map((warning: Violation, idx: number) => ( // iterate over soft violations
              <div // warning card
                key={`soft-${warning.code}-${idx}`} // React key
                className="flex items-start gap-2.5 p-3 rounded-xl bg-warn/10 border border-warn/30 text-warn text-xs" // card styling
              > {/* warning contents */}
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> {/* alert triangle */}
                </svg> {/* closes SVG */}
                <div> {/* message container */}
                  <span className="font-semibold uppercase mr-1">[{warning.ruleId}]</span> {/* rule identifier */}
                  <span>{warning.message}</span> {/* warning message */}
                </div> {/* closes message container */}
                {/* closes warning card */}
              </div>
            ))} {/* ends soft map */}
            {/* closes advisories list */}
          </div>
          {/* closes soft warnings container */}
        </div>
      ) : null} {/* ends soft condition */}
    </div> // closes panel card
  ); // ends return
} // ends ChecksPanel component

// Intent: Main ItineraryView component rendering itinerary header, day tabs, items list, costs, and checks
export function ItineraryView({ onOpenEvidence }: ItineraryViewProps): JSX.Element { // exports main ItineraryView
  // Retrieve global agent run state, selected day, and day updater from context
  const { state, selectedDay, setSelectedDay } = useRun(); // reads context state

  // Resolve active itinerary: final plan takes precedence, followed by active working draft
  const it = state.final ?? state.draft; // resolves active FinalItinerary or null

  // Empty state guard: render friendly message when no plan has been started or produced
  if (!it) { // checks if itinerary object is missing
    return ( // returns empty state placeholder
      <div className="bg-card border border-line rounded-2xl p-8 shadow-sm text-center space-y-3 min-h-[175px] flex flex-col justify-center"> {/* card container with reserved height */}
        <div className="py-12 flex flex-col items-center justify-center text-center text-ink-soft space-y-2 border border-dashed border-line rounded-xl bg-sand/30"> {/* dashed box */}
          <h3 className="text-base font-semibold text-ink font-display"> {/* title */}
            Itinerary {/* section title */}
          </h3> {/* closes title */}
          <p className="text-sm text-ink-soft max-w-md"> {/* friendly message */}
            Your plan will appear here, checked line by line. {/* specification message */}
          </p> {/* closes friendly message */}
        </div> {/* closes dashed box */}
      </div> // closes card container
    ); // ends empty state return
  } // ends empty state guard

  // Determine current active day index (defaults to first day if selectedDay is null or out of bounds)
  const currentDayIndex = // resolves active day index
    selectedDay !== null && selectedDay >= FIRST_ARRAY_INDEX && selectedDay < it.days.length // bounds check
      ? selectedDay // uses selectedDay from context
      : it.days[FIRST_ARRAY_INDEX]?.dayIndex ?? FIRST_ARRAY_INDEX; // falls back to first day index

  // Find corresponding DayPlan object for active day
  const activeDayPlan = // finds matching DayPlan
    it.days.find((day) => day.dayIndex === currentDayIndex) ?? it.days[FIRST_ARRAY_INDEX]; // fallback to first day

  // Format travellers count label with singular or plural suffix
  const travellersText = // formatted traveller count string
    it.request.travelers === SINGLE_ITEM_COUNT // singular condition
      ? "1 traveller" // singular form
      : `${it.request.travelers} travellers`; // plural form

  // Format lodging nights with singular or plural suffix
  const nightsText = // formatted night count string
    it.lodging.nights === SINGLE_ITEM_COUNT // singular condition
      ? "1 night" // singular form
      : `${it.lodging.nights} nights`; // plural form

  // Format lodging rooms with singular or plural suffix
  const roomsText = // formatted room count string
    it.lodging.rooms === SINGLE_ITEM_COUNT // singular condition
      ? "1 room" // singular form
      : `${it.lodging.rooms} rooms`; // plural form

  // Handle keyboard navigation between day tabs according to ARIA tabs specification
  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => { // keyboard handler
    const totalDays = it.days.length; // count of available days
    let nextIndex = currentIndex; // initialize next index

    if (event.key === "ArrowLeft") { // arrow left check
      event.preventDefault(); // prevent scroll
      nextIndex = (currentIndex + PREV_INDEX_OFFSET + totalDays) % totalDays; // shift left circular
    } else if (event.key === "ArrowRight") { // arrow right check
      event.preventDefault(); // prevent scroll
      nextIndex = (currentIndex + NEXT_INDEX_OFFSET) % totalDays; // shift right circular
    } else if (event.key === "Home") { // home key check
      event.preventDefault(); // prevent scroll
      nextIndex = FIRST_ARRAY_INDEX; // jump to first
    } else if (event.key === "End") { // end key check
      event.preventDefault(); // prevent scroll
      nextIndex = totalDays + PREV_INDEX_OFFSET; // jump to last
    } else { // any other key
      return; // exit unhandled
    } // ends key conditions

    const targetDay = it.days[nextIndex]; // find target day
    if (targetDay) { // check if day exists
      setSelectedDay(targetDay.dayIndex); // updates selected day in context
    } // ends check
  }; // ends handleDayKeyDown

  // Render comprehensive ItineraryView
  return ( // returns complete ItineraryView JSX
    <div className="space-y-6"> {/* vertical layout spacing */}
      {/* 1. Header Card: Destination, dates, travellers, lodging, meal tier, and status badges */}
      <div className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-4 min-h-[175px]"> {/* header container with reserved height */}
        {/* Top row: Destination name and status badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4"> {/* top row */}
          <div> {/* title group */}
            <h2 className="text-2xl font-bold text-ink font-display tracking-tight"> {/* destination title */}
              {it.destinationName} {/* destination name string */}
            </h2> {/* closes title */}
            <p className="text-xs text-ink-soft mt-0.5"> {/* date range and travellers */}
              {formatDateRange(it.request.startDate, it.request.endDate)} • {travellersText} {/* date range label */}
            </p> {/* closes date range */}
          </div> {/* closes title group */}

          {/* Badges: Draft round N or Final Plan, and optional Replay badge */}
          <div className="flex items-center gap-2"> {/* badges container */}
            {state.final === null ? ( // draft conditional badge
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sand text-ink-soft border border-line"> {/* draft badge */}
                Draft – round {it.round} {/* draft round label */}
              </span> // closes draft badge
            ) : ( // finalized plan badge
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-ok/10 text-ok border border-ok/30"> {/* final badge */}
                ✓ Final plan {/* final plan text */}
              </span> // closes final badge
            )} {/* ends condition */}

            {it.mode === "replay" ? ( // replay conditional badge
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-marigold-soft text-marigold border border-marigold/30"> {/* replay badge */}
                Replay {/* replay badge label */}
              </span> // closes replay badge
            ) : null} {/* ends replay condition */}
          </div> {/* closes badges container */}
        </div> {/* closes top row */}

        {/* Bottom row: Lodging details and dining meal tier */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs"> {/* details grid */}
          {/* Lodging card box */}
          <div className="p-3.5 rounded-xl bg-sand/30 border border-line space-y-1.5"> {/* lodging box */}
            <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block"> {/* label */}
              Lodging {/* section label */}
            </span> {/* closes label */}
            <div className="flex flex-wrap items-center justify-between gap-2"> {/* name and chip */}
              <span className="font-semibold text-ink text-sm"> {/* lodging name */}
                {it.lodging.name} {/* hotel name string */}
              </span> {/* closes name */}
              <StepFreeChip // step-free accessibility chip for lodging
                stepFree={it.lodging.stepFree} // hotel accessibility status
                placeId={it.lodging.id} // hotel identifier
                onOpenEvidence={onOpenEvidence} // callback handler
              /> {/* closes StepFreeChip */}
            </div> {/* closes name and chip */}
            <p className="text-ink-soft"> {/* lodging details */}
              <span className="capitalize">{it.lodging.tier}</span> tier • {nightsText} • {roomsText} {/* tier and counts */}
            </p> {/* closes lodging details */}
          </div> {/* closes lodging box */}

          {/* Dining plan card box */}
          <div className="p-3.5 rounded-xl bg-sand/30 border border-line space-y-1.5"> {/* dining box */}
            <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider block"> {/* label */}
              Dining Plan {/* section label */}
            </span> {/* closes label */}
            <div className="flex items-center justify-between gap-2"> {/* meal title */}
              <span className="font-semibold text-ink text-sm capitalize"> {/* meal tier name */}
                {it.mealTier} dining tier {/* tier title */}
              </span> {/* closes name */}
              <span className="text-base" role="img" aria-label="Dining">🍛</span> {/* dining icon */}
            </div> {/* closes meal title */}
            <p className="text-ink-soft"> {/* meal description */}
              Curated lunch stops with verified rest pacing for party comfort {/* explanation */}
            </p> {/* closes meal description */}
          </div> {/* closes dining box */}
        </div> {/* closes details grid */}
      </div> {/* closes header card */}

      {/* 2. Day Tabs: Accessible tablist switching active itinerary day */}
      <div className="space-y-3"> {/* day tabs container */}
        <div // tablist element
          role="tablist" // ARIA tablist role
          aria-label="Itinerary day schedule" // accessible label
          className="flex overflow-x-auto gap-2 pb-1 scrollbar-none" // scrollable horizontal tabs bar
        > {/* day tab buttons */}
          {it.days.map((day, index) => { // iterate through days
            const isTabActive = day.dayIndex === currentDayIndex; // active check
            const formattedDate = formatDayDate(day.date); // formatted date string
            const weather = day.weather; // weather forecast object
            // Compute short packing tip from that day's weather forecast rules
            const packingTip = computePackingTip(weather); // packing tip string or null

            return ( // returns tab button JSX
              <button // tab button
                key={day.dayIndex} // React key
                id={`itinerary-tab-day-${day.dayIndex}`} // unique DOM id
                role="tab" // ARIA tab role
                type="button" // button type
                aria-selected={isTabActive} // ARIA selected boolean
                aria-controls={`itinerary-panel-day-${day.dayIndex}`} // associates with panel
                tabIndex={isTabActive ? 0 : -1} // roving tabindex
                onClick={() => setSelectedDay(day.dayIndex)} // selects active day
                onKeyDown={(e) => handleDayKeyDown(e, index)} // keyboard navigation handler
                className={`min-h-11 shrink-0 px-4 py-2.5 rounded-xl text-left border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${ // styling
                  isTabActive // conditional active styles
                    ? "bg-lake text-white border-lake shadow-sm" // active colors
                    : "bg-card text-ink border-line hover:bg-sand/60" // inactive colors
                }`} // closes template string
              > {/* tab contents */}
                <div className="text-xs font-semibold font-display"> {/* day number and date */}
                  Day {day.dayIndex + ONE_BASED_OFFSET} – {formattedDate} {/* label */}
                </div> {/* closes label */}
                {weather ? ( // weather forecast indicator
                  <div className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isTabActive ? "text-sand/80" : "text-ink-soft"}`}> {/* weather row */}
                    <span>{weather.label}</span> {/* weather condition label */}
                    {weather.rainProbPct !== null && weather.rainProbPct !== undefined ? ( // rain probability check
                      <span>• {weather.rainProbPct}% rain</span> // rain percentage string
                    ) : null} {/* ends rain check */}
                  </div> // closes weather row
                ) : null} {/* ends weather condition */}
                {packingTip ? ( // conditional packing tip display
                  <div className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${isTabActive ? "text-sand/90" : "text-lake"}`}> {/* tip row */}
                    <span aria-hidden="true">💡</span> {/* lightbulb tip icon */}
                    <span>{packingTip}</span> {/* packing tip text */}
                  </div> // closes tip row
                ) : null} {/* ends packing tip condition */}
              </button> // closes tab button
            ); // ends tab return
          })} {/* ends days map */}
        </div> {/* closes tablist */}

        {/* 3. Items list for active day in order: visit, transit, meal, and rest */}
        {activeDayPlan ? ( // check if active day plan exists
          <div // active day panel
            id={`itinerary-panel-day-${activeDayPlan.dayIndex}`} // panel id
            role="tabpanel" // ARIA tabpanel role
            aria-labelledby={`itinerary-tab-day-${activeDayPlan.dayIndex}`} // associates with tab
            className="bg-sand/30 border border-line rounded-2xl p-5 shadow-sm space-y-3" // container styling
          > {/* day panel contents */}
            {/* Day theme heading */}
            <div className="flex items-center justify-between border-b border-line pb-2.5"> {/* theme row */}
              <h3 className="text-sm font-semibold text-ink font-display"> {/* theme title */}
                Day {activeDayPlan.dayIndex + ONE_BASED_OFFSET}: {formatPlannerDayNumbers(activeDayPlan.theme)} {/* day theme text with 1-based days */}
              </h3> {/* closes title */}
              <span className="text-xs text-ink-soft"> {/* items count */}
                {activeDayPlan.items.length} segments {/* segment count */}
              </span> {/* closes items count */}
            </div> {/* closes theme row */}

            {/* Chronological items list */}
            <div className="space-y-2.5 pt-1"> {/* items container */}
              {activeDayPlan.items.map((item) => ( // iterate through items in day
                <ItineraryItemRow // renders individual row
                  key={item.id} // item unique identifier
                  item={item} // item record
                  onOpenEvidence={onOpenEvidence} // evidence callback
                /> // closes ItineraryItemRow
              ))} {/* ends items map */}
            </div> {/* closes items container */}
          </div> // closes active day panel
        ) : null} {/* ends activeDayPlan condition */}
      </div> {/* closes day tabs container */}

      {/* 6. "Costs" accordion: grouped categories with subtotals, grand total, and FX details */}
      <CostsAccordion costs={it.costs} /> {/* renders costs accordion */}

      {/* Accessibility audit badge, statistics line, verified sources, and Tavily attribution */}
      <AccessibilityAudit audit={it.audit} /> {/* renders accessibility audit */}

      {/* 7. "Checks" panel: hard constraints and soft advisories */}
      <ChecksPanel validation={it.validation} /> {/* renders checks panel */}
    </div> // closes outer layout container
  ); // ends return
} // ends ItineraryView component
