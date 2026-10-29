// Import React hooks, references, and JSX types
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react"; // React core primitives
// Import formatting helpers for currency, model name, agent names, and rule identifiers
import { AGENT_LABEL, RULE_SHORT, formatPlannerDayNumbers, money, shortModelName } from "../lib/format.js"; // shared display formatters
// Import useRun hook to read events and itinerary state
import { useRun } from "../state/RunProvider.js"; // global agent state provider hook
// Import shared types for AgentName, Directive, FinalItinerary, and ToolName
import type { AgentName, Directive, FinalItinerary, ToolName } from "../../types/travelverse.js"; // domain contracts

// Define named constant for milliseconds per second
const MS_PER_SECOND = 1000; // factor to convert millisecond timestamps to seconds
// Define named constant for single decimal place precision
const ONE_DECIMAL_PLACE = 1; // decimal places for seconds formatting
// Define named constant for scroll threshold in pixels
const SCROLL_THRESHOLD_PX = 40; // pixel distance from bottom before showing jump button
// Define named constant for USD currency decimal precision
const USD_DECIMAL_PRECISION = 3; // decimals for USD dollar amounts
// Define named constant for empty collection length
const EMPTY_COLLECTION_LENGTH = 0; // threshold for empty event lists
// Define named constant for single item count
const SINGLE_ITEM_COUNT = 1; // threshold for singular versus plural labels
// Define named constant for zero scroll position
const ZERO_SCROLL_POSITION = 0; // top offset position

// Map of canonical tool identifiers to clean human-readable tool names
const TOOL_DISPLAY_NAMES: Record<ToolName, string> = { // maps ToolName to UI label
  "nominatim.search": "Nominatim", // Nominatim geocoder
  "overpass.query": "Overpass", // Overpass OpenStreetMap query
  "osrm.table": "OSRM", // OSRM routing engine
  "open_meteo.forecast": "Open-Meteo", // Open-Meteo weather API
  "tavily.search": "Tavily Search", // Tavily web search
  "tavily.extract": "Tavily Extract", // Tavily deep web content extractor
}; // ends TOOL_DISPLAY_NAMES map

// Interface defining the structure of a rendered timeline row item
interface TimelineRowItem { // internal timeline presentation record
  id: string; // unique DOM key
  t: number; // millisecond timestamp
  agent: AgentName; // responsible agent identifier
  tone: "default" | "ok" | "bad" | "marigold" | "muted"; // visual style tone
  mainText: ReactNode; // primary message content
  subText?: ReactNode; // secondary subtitle or note
  details?: ReactNode; // expandable details or directives
  isLoading?: boolean; // indicates pending async operation
} // ends TimelineRowItem interface

// Intent: Render agent avatar icon with accessible hidden text
function AgentIcon({ agent }: { agent: AgentName }): JSX.Element { // helper icon component
  // Render compass icon for orchestrator
  if (agent === "orchestrator") { // orchestrator agent check
    return ( // returns compass icon
      <span className="w-5 h-5 rounded-md bg-lake/10 text-lake flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        🧭 {/* compass emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends orchestrator check

  // Render blueprint icon for planner
  if (agent === "planner") { // planner agent check
    return ( // returns blueprint icon
      <span className="w-5 h-5 rounded-md bg-lake-soft text-lake flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        📐 {/* triangular ruler emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends planner check

  // Render scales icon for critic
  if (agent === "critic") { // critic agent check
    return ( // returns balance scale icon
      <span className="w-5 h-5 rounded-md bg-bad/10 text-bad flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        ⚖️ {/* balance scale emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends critic check

  // Render wheelchair accessibility icon for accessibility proof
  if (agent === "accessibility_proof") { // accessibility proof agent check
    return ( // returns accessibility icon
      <span className="w-5 h-5 rounded-md bg-lake-soft text-lake flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        ♿ {/* wheelchair emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends accessibility check

  // Render weather icon for conditions scout
  if (agent === "conditions_scout") { // conditions scout agent check
    return ( // returns weather icon
      <span className="w-5 h-5 rounded-md bg-marigold-soft text-warn flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        ⛅ {/* sun behind cloud emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends conditions check

  // Render coin bag icon for budget keeper
  if (agent === "budget_keeper") { // budget keeper agent check
    return ( // returns currency icon
      <span className="w-5 h-5 rounded-md bg-ok/10 text-ok flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        💰 {/* money bag emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends budget check

  // Render magnifying glass for explorer
  if (agent === "explorer") { // explorer agent check
    return ( // returns search icon
      <span className="w-5 h-5 rounded-md bg-sand text-ink flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        🔍 {/* magnifying glass emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends explorer check

  // Render theater masks for mood matcher
  if (agent === "mood_matcher") { // mood matcher agent check
    return ( // returns mask icon
      <span className="w-5 h-5 rounded-md bg-marigold-soft text-warn flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
        🎭 {/* performing arts emoji */}
        <span className="sr-only">{AGENT_LABEL[agent]}</span> {/* screen reader text */}
      </span> // closes badge
    ); // ends return
  } // ends mood check

  // Default gear icon for rules engine or any other agent
  return ( // returns default gear icon
    <span className="w-5 h-5 rounded-md bg-sand text-ink-soft flex items-center justify-center shrink-0" aria-hidden="true"> {/* icon badge */}
      ⚙️ {/* gear emoji */}
      <span className="sr-only">{AGENT_LABEL[agent] ?? agent}</span> {/* screen reader text */}
    </span> // closes badge
  ); // ends return
} // ends AgentIcon helper

// Intent: Resolve directive operation and place IDs into readable place names using draft visit items
function resolveDirectiveText(directive: Directive, draft: FinalItinerary | null): string { // helper to humanize directives
  // Helper function to resolve place ID to human readable place name
  const resolvePlaceName = (targetId: string): string => { // searches draft for visit item
    if (!draft) return targetId; // returns ID when draft is absent
    for (const day of draft.days) { // iterate through itinerary days
      for (const item of day.items) { // iterate through day items
        if (item.kind === "visit" && item.placeId === targetId) { // check match
          return item.name; // returns human place name
        } // ends check
      } // ends items loop
    } // ends days loop
    return targetId; // fallback to raw ID
  }; // ends resolvePlaceName

  // Helper function to resolve lodging ID to human readable lodging name
  const resolveLodgingName = (lodgingId: string): string => { // searches draft lodging
    if (draft && draft.lodging.id === lodgingId) { // check match
      return draft.lodging.name; // returns hotel name
    } // ends check
    return lodgingId; // fallback to raw ID
  }; // ends resolveLodgingName

  // Format directive according to operation type
  switch (directive.op) { // switch on operation discriminant
    case "drop_place": // handle drop_place
      return formatPlannerDayNumbers(`Drop ${resolvePlaceName(directive.placeId)}: ${directive.reason}`); // formatted string with 1-based days
    case "swap_place": // handle swap_place
      return formatPlannerDayNumbers(`Swap ${resolvePlaceName(directive.placeId)} → ${resolvePlaceName(directive.replacementId)}: ${directive.reason}`); // formatted string with 1-based days
    case "change_lodging": // handle change_lodging
      return formatPlannerDayNumbers(`Change hotel to ${resolveLodgingName(directive.lodgingId)}: ${directive.reason}`); // formatted string with 1-based days
    case "change_meal_tier": // handle change_meal_tier
      return formatPlannerDayNumbers(`Change meals to ${directive.mealTier} tier: ${directive.reason}`); // formatted string with 1-based days
    case "move_place": // handle move_place
      return formatPlannerDayNumbers(`Move ${resolvePlaceName(directive.placeId)} to Day ${directive.toDayIndex + SINGLE_ITEM_COUNT}: ${directive.reason}`); // formatted string with 1-based days
  } // ends switch
} // ends resolveDirectiveText

// Props interface for AgentTimeline component
export interface AgentTimelineProps { // props specification
  // Optional callback handler to open evidence drawer for a given place or hotel ID
  onOpenEvidence?: (placeId: string) => void; // callback handler
} // ends AgentTimelineProps interface

// Intent: Render AgentTimeline tracking live multi-agent events with auto-scroll and detailed mapping
export function AgentTimeline({ onOpenEvidence }: AgentTimelineProps = {}): JSX.Element { // exports AgentTimeline component
  // Access agent run state from context
  const { state } = useRun(); // reads state including events and active draft
  // Reference to the scrollable container element for managing scroll position
  const scrollContainerRef = useRef<HTMLDivElement | null>(null); // DOM ref to scrollable div
  // State tracking whether the user has scrolled up away from the bottom
  const [hasScrolledUp, setHasScrolledUp] = useState<boolean>(false); // tracks user scroll state

  // Memoize search for the first drafted or finalized stop that contains accessibility evidence
  const firstStopWithEvidence = useMemo(() => { // searches for stop with evidence
    const it = state.final ?? state.draft; // resolves active itinerary
    if (!it) { // guard against missing itinerary
      return null; // returns null when no draft exists
    } // ends null check
    // Search visit stops across all scheduled days
    for (const day of it.days) { // iterate through days
      for (const item of day.items) { // iterate through items in day
        if (item.kind === "visit" && item.evidence && item.evidence.length > EMPTY_COLLECTION_LENGTH) { // check visit evidence
          return { id: item.placeId, name: item.name }; // returns first stop matching criteria
        } // ends evidence check
      } // ends items loop
    } // ends days loop
    // Fall back to checking lodging evidence if visits have no evidence
    if (it.lodging.evidence && it.lodging.evidence.length > EMPTY_COLLECTION_LENGTH) { // check hotel evidence
      return { id: it.lodging.id, name: it.lodging.name }; // returns hotel matching criteria
    } // ends lodging check
    return null; // no evidence found
  }, [state.final, state.draft]); // recomputes when draft or final updates

  // Process raw SSE events into presentation rows, combining tool calls and results
  const timelineRows = useMemo<TimelineRowItem[]>(() => { // memoized row builder
    // Initialize empty array of timeline rows
    const rows: TimelineRowItem[] = []; // row accumulator
    // Map tracking row indices by tool callId to prevent duplicate rows
    const toolCallIndexMap = new Map<string, number>(); // callId to array index map

    // Iterate through every event in the run state
    for (const event of state.events) { // event iteration loop
      // Map thinking event
      if (event.type === "thinking") { // checks for thinking event
        rows.push({ // append row
          id: `think_${event.seq}`, // unique DOM id
          t: event.t, // timestamp
          agent: event.agent, // thinking agent
          tone: "default", // neutral tone
          mainText: formatPlannerDayNumbers(event.text), // thought text formatted to 1-based days
        }); // ends push
      } else if (event.type === "llm_call") { // checks for llm_call event
        // Format model execution details
        const durationSec = (event.ms / MS_PER_SECOND).toFixed(ONE_DECIMAL_PLACE); // formatted seconds
        if (event.ok) { // check if call succeeded
          rows.push({ // append success row
            id: `llm_${event.seq}`, // unique DOM id
            t: event.t, // timestamp
            agent: event.agent, // requesting agent
            tone: "default", // neutral tone
            mainText: `${shortModelName(event.model)} - ${event.tokensOut} tokens, ${durationSec} s`, // summary
            subText: event.note.length > EMPTY_COLLECTION_LENGTH ? event.note : undefined, // small grey note
          }); // ends push
        } else { // call failed
          rows.push({ // append failure row
            id: `llm_${event.seq}`, // unique DOM id
            t: event.t, // timestamp
            agent: event.agent, // requesting agent
            tone: "bad", // red bad tone
            mainText: `Model call failed: ${event.note}`, // failure message
          }); // ends push
        } // ends call success condition
      } else if (event.type === "tool_call") { // checks for tool_call event
        // Look up human readable tool label
        const toolLabel = TOOL_DISPLAY_NAMES[event.tool] ?? event.tool; // tool label
        // Record row index to allow subsequent tool_result to update this row
        toolCallIndexMap.set(event.callId, rows.length); // stores index by callId
        rows.push({ // append pending tool row with spinner
          id: `tool_${event.callId}`, // unique callId DOM key
          t: event.t, // invocation timestamp
          agent: event.agent, // calling agent
          tone: "default", // neutral tone
          isLoading: true, // indicates pending spinner
          mainText: `${toolLabel} query initiated...`, // in-progress text
        }); // ends push
      } else if (event.type === "tool_result") { // checks for tool_result event
        // Look up tool label
        const toolLabel = TOOL_DISPLAY_NAMES[event.tool] ?? event.tool; // tool label
        // Format cached label suffix
        const cachedSuffix = event.cached ? " (cached)" : ""; // cached indicator
        // Detect tool timeout conditions (e.g. Overpass server timeout, TOOL_TIMEOUT, timed out)
        const isTimeout = !event.ok && (/timeout|timed out/i.test(event.summary) || /timeout/i.test(event.tool)); // detects timeout
        // Derive destination city name for calm fallback message
        const cityName = state.final?.request.destination || state.draft?.request.destination || "Udaipur"; // destination city name
        // Determine tone: calm amber marigold for timeouts, bad red for other failures, default for success
        let resultTone: "default" | "bad" | "marigold" = event.ok ? "default" : "bad"; // initial tone
        let resultText = `${toolLabel}: ${event.summary}${cachedSuffix}`; // default result summary text
        if (isTimeout) { // check if failure was a timeout
          resultTone = "marigold"; // calm amber note
          if (event.tool === "overpass.query" || event.tool === "nominatim.search") { // map/search tool check
            resultText = `Map search was slow, so we’re using verified ${cityName} data instead`; // calm friendly message
          } else { // other tool timeout
            resultText = `${toolLabel} search was slow, so we’re using verified ${cityName} data instead`; // calm friendly fallback
          } // ends tool type check
        } // ends timeout check
        // Check if matching tool_call row exists in our array
        const existingRowIndex = toolCallIndexMap.get(event.callId); // reads index
        if (existingRowIndex !== undefined && rows[existingRowIndex]) { // verifies existing row
          // Update existing row in place to ensure ONE row per callId
          rows[existingRowIndex] = { // mutates record
            ...rows[existingRowIndex], // preserves ID and agent
            t: event.t, // update timestamp to result arrival
            isLoading: false, // stops spinner
            tone: resultTone, // calm amber if timeout, red if failed, default if ok
            mainText: resultText, // result text or calm fallback
          }; // ends assignment
        } else { // standalone result
          rows.push({ // append standalone result row
            id: `tool_res_${event.seq}`, // unique DOM id
            t: event.t, // result timestamp
            agent: event.agent, // calling agent
            tone: resultTone, // calm amber if timeout, red if failed, default if ok
            isLoading: false, // not loading
            mainText: resultText, // result text or calm fallback
          }); // ends push
        } // ends existing row check
      } else if (event.type === "rule_check") { // checks for rule_check event
        // Intentionally not rendered as rows per specification (RuleGrid handles rule checks)
        continue; // skip to next event
      } else if (event.type === "critic_flag") { // checks for critic_flag event
        // Extract rule identifier and short rule name
        const ruleName = RULE_SHORT[event.violation.ruleId] ?? event.violation.ruleId; // short rule title
        rows.push({ // append red critic row
          id: `critic_${event.seq}`, // unique DOM id
          t: event.t, // flag timestamp
          agent: "critic", // critic agent
          tone: "bad", // red bad styling
          mainText: formatPlannerDayNumbers(`${event.violation.ruleId} ${ruleName}: ${event.violation.message}`), // violation message with 1-based days
        }); // ends push
      } else if (event.type === "replan") { // checks for replan event
        // Count directives present in replan event
        const directiveCount = event.directives.length; // total directives count
        // Render expandable list element for replan directives
        const directivesDetail = directiveCount > EMPTY_COLLECTION_LENGTH ? ( // check if directives exist
          <details className="mt-1 text-xs text-ink cursor-pointer"> {/* native expandable container */}
            <summary className="hover:text-ink font-semibold select-none text-[11px] text-marigold"> {/* expandable toggle */}
              View {directiveCount} repair directive{directiveCount === SINGLE_ITEM_COUNT ? "" : "s"} {/* toggle label */}
            </summary> {/* closes summary */}
            <ul className="mt-1.5 pl-2.5 space-y-1 border-l-2 border-marigold/50 text-[11px] text-ink-soft"> {/* list container */}
              {event.directives.map((directive, directiveIndex) => ( // iterate over directives
                <li key={directiveIndex}> {/* list item */}
                  • {resolveDirectiveText(directive, state.draft)} {/* resolved directive description */}
                </li> // closes list item
              ))} {/* ends map */}
            </ul> {/* closes list */}
          </details> // closes details
        ) : undefined; // undefined if no directives

        rows.push({ // append marigold replan row
          id: `replan_${event.seq}`, // unique DOM id
          t: event.t, // replan timestamp
          agent: "planner", // planner agent
          tone: "marigold", // marigold styling
          mainText: `Re-plan round ${event.round} with ${shortModelName(event.model)}: ${directiveCount} directive(s)`, // replan summary
          details: directivesDetail, // expandable directives JSX
        }); // ends push
      } else if (event.type === "draft") { // checks for draft event
        // Extract total cost and budget from itinerary
        const totalFormatted = money(event.itinerary.costs.grandTotalMinor, event.itinerary.costs.currency); // formatted total
        const budgetFormatted = money(event.itinerary.costs.budgetMinor, event.itinerary.costs.currency); // formatted budget
        const hardViolations = event.itinerary.validation.hardCount; // hard violations count
        const softViolations = event.itinerary.validation.softCount; // soft violations count
        rows.push({ // append draft row
          id: `draft_${event.seq}`, // unique DOM id
          t: event.t, // draft timestamp
          agent: "planner", // planner agent
          tone: "default", // neutral tone
          mainText: `Draft round ${event.round}: ${totalFormatted} of ${budgetFormatted}, ${hardViolations} hard / ${softViolations} soft`, // draft status
        }); // ends push
      } else if (event.type === "plan_finalized") { // checks for plan_finalized event
        rows.push({ // append green plan_finalized row
          id: `final_${event.seq}`, // unique DOM id
          t: event.t, // final timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "ok", // green ok styling
          mainText: "Plan ready - every hard rule passes", // ready message
        }); // ends push
      } else if (event.type === "tradeoff_required") { // checks for tradeoff_required event
        rows.push({ // append marigold tradeoff row
          id: `tradeoff_${event.seq}`, // unique DOM id
          t: event.t, // tradeoff timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "marigold", // marigold styling
          mainText: "Needs your decision", // decision prompt
        }); // ends push
      } else if (event.type === "usage") { // checks for usage event
        // Format estimated dollar cost with 3 decimal places
        const formattedUsd = event.estUsd.toFixed(USD_DECIMAL_PRECISION); // formatted USD
        rows.push({ // append usage row
          id: `usage_${event.seq}`, // unique DOM id
          t: event.t, // usage timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "default", // neutral tone
          mainText: `This plan cost about $${formattedUsd} - ${event.llmCalls} model calls, ${event.toolCalls} tool calls, ${event.tavilyCredits} Tavily credits`, // cost breakdown
        }); // ends push
      } else if (event.type === "error") { // checks for error event
        rows.push({ // append red error row
          id: `err_${event.seq}`, // unique DOM id
          t: event.t, // error timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "bad", // red bad styling
          mainText: event.message, // error message
        }); // ends push
      } else if (event.type === "replay_notice") { // checks for replay_notice event
        rows.push({ // append grey replay notice row
          id: `replay_${event.seq}`, // unique DOM id
          t: event.t, // replay timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "muted", // grey styling
          mainText: `Replay: ${event.reason}`, // replay reason
        }); // ends push
      } else if (event.type === "run_started") { // checks for run_started event
        rows.push({ // append run_started row
          id: `start_${event.seq}`, // unique DOM id
          t: event.t, // start timestamp
          agent: "orchestrator", // orchestrator agent
          tone: "default", // neutral tone
          mainText: `Planning started for ${event.destination} (${event.mode} mode)`, // start announcement
        }); // ends push
      } // ends event type checks
    } // ends for loop

    return rows; // returns calculated array of timeline rows
  }, [state.events, state.draft, state.final]); // recomputes whenever events, draft, or final update

  // Scroll detection handler to determine if user has scrolled away from the bottom
  const handleScroll = () => { // scroll callback
    const container = scrollContainerRef.current; // reads DOM element
    if (!container) return; // guard against null
    // Calculate distance between current scroll offset and container bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight; // distance
    // Update state indicating if scrolled up
    setHasScrolledUp(distanceFromBottom > SCROLL_THRESHOLD_PX); // true when away from bottom
  }; // ends handleScroll

  // Auto-scroll to newest events at bottom unless user scrolled up
  useEffect(() => { // lifecycle hook for scrolling
    // Guard: do not auto-scroll if user explicitly scrolled up to read earlier items
    if (!hasScrolledUp && scrollContainerRef.current) { // auto-scroll condition
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight; // scrolls to bottom
    } // ends check
  }, [timelineRows.length, hasScrolledUp]); // runs whenever new rows arrive

  // Action function to jump scroll position directly to latest events
  const handleJumpToLatest = () => { // click handler for jump button
    if (scrollContainerRef.current) { // checks element presence
      scrollContainerRef.current.scrollTo({ // smooth scroll invocation
        top: scrollContainerRef.current.scrollHeight, // scroll target
        behavior: "smooth", // smooth animation
      }); // ends scrollTo
      setHasScrolledUp(false); // resets scrolled up flag
    } // ends check
  }; // ends handleJumpToLatest

  // Render idle placeholder when no events exist in current run
  if (timelineRows.length === EMPTY_COLLECTION_LENGTH) { // empty timeline check
    return ( // returns idle JSX
      <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-3"> {/* card container */}
        <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
          <h3 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            Agent Timeline {/* heading text */}
          </h3> {/* closes heading */}
          <span className="text-[11px] font-medium text-ink-soft bg-sand border border-line px-2 py-0.5 rounded-full"> {/* badge */}
            Idle {/* idle indicator */}
          </span> {/* closes badge */}
        </div> {/* closes header row */}
        <p className="text-xs text-ink-soft leading-relaxed"> {/* description */}
          Agent thoughts, model latencies, real-time tool checks, and repair critic steps will stream here in real time. {/* text */}
        </p> {/* closes description */}
      </div> // closes card container
    ); // ends return
  } // ends empty check

  // Render active scrollable timeline with ARIA log role
  return ( // returns active timeline JSX
    <div id="live-timeline" className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-3 relative"> {/* card container */}
      <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
        <div className="flex items-center gap-2"> {/* title group */}
          <h3 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            Agent Timeline {/* heading text */}
          </h3> {/* closes heading */}
          <span className="w-2 h-2 rounded-full bg-ok animate-pulse" aria-hidden="true" /> {/* live stream pulse */}
        </div> {/* closes title group */}
        <span className="text-[11px] font-medium text-ink-soft"> {/* event counter */}
          {timelineRows.length} event{timelineRows.length === SINGLE_ITEM_COUNT ? "" : "s"} {/* count */}
        </span> {/* closes counter */}
      </div> {/* closes header row */}

      {/* Accessible scrollable log container */}
      <div // log container element
        ref={scrollContainerRef} // attaches ref for scroll manipulation
        onScroll={handleScroll} // listens for user scroll events
        role="log" // ARIA log role for streaming updates
        aria-live="polite" // screen readers politely announce additions
        aria-relevant="additions" // only new entries are announced
        className="h-[440px] overflow-y-auto space-y-2 pr-1.5 text-xs focus:outline-none" // scrollable styling
        tabIndex={ZERO_SCROLL_POSITION} // keyboard scrollable
      > {/* timeline entries */}
        {timelineRows.map((row) => { // iterate through timeline rows
          // Format elapsed seconds timestamp string
          const formattedSeconds = `${(row.t / MS_PER_SECOND).toFixed(ONE_DECIMAL_PLACE)} s`; // formatted seconds
          // Determine tone border and background styling
          let toneClasses = "border-line/70 bg-sand/20 text-ink"; // default styling
          if (row.tone === "ok") { // ok green styling
            toneClasses = "border-ok/30 bg-ok/10 text-ok font-medium"; // green theme
          } else if (row.tone === "bad") { // bad red styling
            toneClasses = "border-bad/30 bg-bad/10 text-bad font-medium"; // red theme
          } else if (row.tone === "marigold") { // marigold orange styling
            toneClasses = "border-marigold/40 bg-marigold-soft text-ink"; // marigold theme
          } else if (row.tone === "muted") { // grey muted styling
            toneClasses = "border-line bg-sand/60 text-ink-soft"; // grey theme
          } // ends tone conditions

          // Render individual timeline row
          return ( // returns row JSX
            <div // row card element
              key={row.id} // unique row key
              className={`p-2.5 rounded-xl border transition-all ${toneClasses}`} // row styling
            > {/* row contents */}
              <div className="flex items-start gap-2.5"> {/* row flex layout */}
                <AgentIcon agent={row.agent} /> {/* agent avatar */}
                <div className="flex-1 min-w-0"> {/* content column */}
                  <div className="flex items-baseline justify-between gap-2"> {/* header line */}
                    <span className="font-bold text-[11px] text-ink uppercase tracking-wide"> {/* agent name */}
                      {AGENT_LABEL[row.agent] ?? row.agent} {/* agent label */}
                    </span> {/* closes agent name */}
                    <span className="text-[10px] font-mono text-ink-soft shrink-0"> {/* timestamp */}
                      {formattedSeconds} {/* 12.4 s format */}
                    </span> {/* closes timestamp */}
                  </div> {/* closes header line */}
                  <div className="text-xs leading-relaxed break-words mt-0.5"> {/* main text body */}
                    {row.isLoading && ( // render loading spinner if in flight
                      <svg // spinner SVG
                        className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-lake inline" // animated spinner styling
                        xmlns="http://www.w3.org/2000/svg" // SVG namespace
                        fill="none" // no fill
                        viewBox="0 0 24 24" // viewBox
                        aria-hidden="true" // hides from screen readers
                      > {/* spinner tracks */}
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /> {/* ring */}
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /> {/* arc */}
                      </svg> // closes spinner
                    )} {/* ends spinner check */}
                    {row.mainText} {/* main event text */}
                  </div> {/* closes main text */}
                  {row.subText && ( // render optional subtext note
                    <div className="text-[11px] text-ink-soft mt-0.5"> {/* subtext container */}
                      {row.subText} {/* small grey note */}
                    </div> // closes subtext container
                  )} {/* ends subtext check */}
                  {row.details} {/* optional expandable details */}
                  {/* View evidence link for accessibility_proof rows */}
                  {row.agent === "accessibility_proof" && onOpenEvidence && firstStopWithEvidence && ( // accessibility proof link condition
                    <div className="mt-1.5 pt-1.5 border-t border-line/40"> {/* link container */}
                      <button // interactive link button to open evidence drawer
                        type="button" // button type
                        onClick={() => onOpenEvidence(firstStopWithEvidence.id)} // opens drawer with target stop
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-lake hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lake" // accessible link styling
                        aria-label={`View evidence for ${firstStopWithEvidence.name}`} // accessible label
                      > {/* button label */}
                        <span>View evidence</span> {/* link text */}
                        <span aria-hidden="true">→</span> {/* arrow indicator */}
                      </button> {/* closes button */}
                    </div> // closes link container
                  )} {/* ends accessibility_proof link check */}
                </div> {/* closes content column */}
              </div> {/* closes row flex layout */}
            </div> // closes row card
          ); // ends return
        })} {/* ends timelineRows map */}
      </div> {/* closes log container */}

      {/* Floating Jump to latest button displayed when user scrolled up */}
      {hasScrolledUp && ( // conditional render when scrolled up
        <button // jump to latest button
          type="button" // standard button type
          onClick={handleJumpToLatest} // triggers smooth scroll to bottom
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-ink text-white text-xs font-semibold rounded-full shadow-lg hover:bg-ink/90 flex items-center gap-1.5 transition-all z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
        > {/* button contents */}
          <span aria-hidden="true">↓</span> {/* down arrow */}
          <span>Jump to latest</span> {/* button text */}
        </button> // closes jump button
      )} {/* ends hasScrolledUp check */}
    </div> // closes card container
  ); // ends return
} // ends AgentTimeline component
