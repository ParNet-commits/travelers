// Import React core hooks and JSX types
import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from "react"; // React hooks for state, ref, and event management
// Import money formatting helper to display formatted currency amounts
import { money } from "../lib/format.js"; // localized money formatter
// Import useRun hook to read active agent run state and dispatch user decision
import { useRun } from "../state/RunProvider.js"; // global agent run context hook

// Define named constant for empty collection length
const EMPTY_LENGTH = 0; // threshold for empty lists
// Define named constant for first array index
const FIRST_INDEX = 0; // index of first item in array
// Define named constant for index offset to reach last element
const LAST_INDEX_OFFSET = 1; // offset from length to get last index
// Define named constant for keyboard event key names
const ESCAPE_KEY = "Escape"; // escape key identifier
const TAB_KEY = "Tab"; // tab key identifier
// Define CSS selector string identifying all interactive focusable DOM elements
const FOCUSABLE_ELEMENTS_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'; // focusable selector query
// Define named constant for initial focus delay in milliseconds
const INITIAL_FOCUS_DELAY_MS = 10; // timer delay for mounting focus transition
// Define named constant for zero budget delta threshold
const ZERO_DELTA_THRESHOLD = 0; // threshold separating positive and non-positive budget delta

// Intent: Render accessible modal trade-off dialog when human decision is needed
export function TradeoffDialog(): JSX.Element | null { // exports TradeoffDialog component
  // Retrieve agent state and choose action from global run context
  const { state, choose } = useRun(); // reads active agent run state and choose callback
  // Track whether the user has temporarily dismissed the dialog without choosing
  const [isDismissed, setIsDismissed] = useState<boolean>(false); // tracks temporary dismissal
  // Ref to hold the dialog container DOM element for focus trap
  const dialogRef = useRef<HTMLDivElement | null>(null); // DOM ref to dialog container
  // Ref to store previously focused element before opening dialog
  const previousFocusRef = useRef<HTMLElement | null>(null); // DOM ref to triggering element
  // Ref to first choice button for initial focus
  const firstChoiceButtonRef = useRef<HTMLButtonElement | null>(null); // DOM ref to initial focus target

  // Derive whether dialog should be active based on run state
  const shouldOpen = state.status === "awaiting_user" && state.tradeoff !== null && !isDismissed; // visibility boolean

  // Reset dismissed state whenever status changes away from awaiting_user
  useEffect(() => { // effect resetting dismissal on new status
    if (state.status !== "awaiting_user") { // checks if status changed
      setIsDismissed(false); // resets dismissal state
    } // ends check
  }, [state.status]); // re-runs on status update

  // Manage modal focus capture, body scroll lock, Escape key listener, and focus restoration
  useEffect(() => { // lifecycle hook when dialog open state changes
    if (shouldOpen) { // check if dialog is active
      // Save element focused before dialog opened
      previousFocusRef.current = document.activeElement as HTMLElement | null; // captures active element
      // Lock background body scrolling
      const originalOverflow = document.body.style.overflow; // preserves original overflow style
      document.body.style.overflow = "hidden"; // locks body scroll

      // Focus first choice button after initial paint
      const focusTimer = setTimeout(() => { // timeout allows animation frame to mount DOM
        firstChoiceButtonRef.current?.focus(); // focuses primary button
      }, INITIAL_FOCUS_DELAY_MS); // short delay constant

      // Global keyboard listener for Escape key
      const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => { // keyboard listener
        if (event.key === ESCAPE_KEY) { // checks for escape key
          event.preventDefault(); // prevents default browser action
          setIsDismissed(true); // dismisses dialog temporarily
        } // ends escape check
      }; // ends handleGlobalKeyDown

      // Add listener to window
      window.addEventListener("keydown", handleGlobalKeyDown); // registers keydown listener

      // Cleanup function when dialog closes or unmounts
      return () => { // cleanup function
        document.body.style.overflow = originalOverflow; // restores body scroll
        clearTimeout(focusTimer); // clears focus timeout
        window.removeEventListener("keydown", handleGlobalKeyDown); // removes escape listener
        // Restore focus to triggering element
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") { // check trigger
          previousFocusRef.current.focus(); // brings focus back
        } // ends focus restoration
      }; // ends cleanup
    } // ends shouldOpen check
  }, [shouldOpen]); // re-runs when shouldOpen changes

  // Handle Tab and Shift-Tab inside dialog container to trap focus
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { // keyboard trap handler
    if (event.key !== TAB_KEY) { // check if key is not Tab
      return; // ignore other keys
    } // ends check

    if (!dialogRef.current) { // check if dialog container mounted
      return; // exit if not mounted
    } // ends ref check

    // Find all focusable elements within dialog
    const focusableElements = Array.from( // converts NodeList to array
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR) // queries focusable elements
    ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"); // filters out disabled or hidden elements

    if (focusableElements.length === EMPTY_LENGTH) { // check if no focusable elements
      event.preventDefault(); // prevents leaving dialog
      return; // exit early
    } // ends check

    const firstElement = focusableElements[FIRST_INDEX]; // first focusable element
    const lastElement = focusableElements[focusableElements.length - LAST_INDEX_OFFSET]; // last focusable element

    if (event.shiftKey) { // shift-tab backward navigation
      if (document.activeElement === firstElement) { // currently at first element
        event.preventDefault(); // prevents focus escape
        lastElement?.focus(); // wraps focus to last element
      } // ends first element check
    } else { // forward tab navigation
      if (document.activeElement === lastElement) { // currently at last element
        event.preventDefault(); // prevents focus escape
        firstElement?.focus(); // wraps focus to first element
      } // ends last element check
    } // ends tab direction check
  }; // ends handleKeyDown

  // Helper handler when an option is selected by the user
  const handleChoose = (optionId: "A" | "B") => { // choice callback
    choose(optionId); // dispatches choice to agent reducer
    setIsDismissed(false); // resets dismissal
  }; // ends handleChoose

  // If dismissed but still awaiting user, render a floating prompt banner to re-open the dialog
  if (state.status === "awaiting_user" && state.tradeoff && isDismissed) { // dismissed state check
    return ( // returns floating prompt banner JSX
      <div className="fixed bottom-6 right-6 z-40 max-w-md bg-card border border-marigold/40 shadow-xl rounded-2xl p-4 flex items-center justify-between gap-4 animate-bounce-subtle"> {/* floating banner */}
        <div className="space-y-0.5"> {/* banner text group */}
          <p className="text-xs font-semibold text-ink font-display"> {/* title */}
            Your decision is needed {/* prompt title */}
          </p> {/* closes title */}
          <p className="text-[11px] text-ink-soft"> {/* subtitle */}
            Choose between budget trade-off options to finalize your itinerary. {/* prompt subtitle */}
          </p> {/* closes subtitle */}
        </div> {/* closes text group */}
        <button // reopen button
          type="button" // button type
          onClick={() => setIsDismissed(false)} // re-opens dialog
          className="min-h-11 px-3.5 py-2 rounded-xl text-xs font-semibold bg-lake text-white hover:bg-lake/90 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer shrink-0" // button styling
        > {/* button contents */}
          View options {/* button label */}
        </button> {/* closes button */}
      </div> // closes floating banner
    ); // ends return
  } // ends dismissed condition

  // Guard: return null when dialog should not be rendered
  if (!shouldOpen || !state.tradeoff) { // check if dialog should be hidden
    return null; // renders nothing
  } // ends guard

  // Render modal trade-off dialog
  return ( // returns dialog JSX
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto" aria-live="assertive"> {/* full-screen overlay */}
      {/* Semi-transparent backdrop overlay with blur */}
      <div // backdrop element
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity" // overlay styling
        onClick={() => setIsDismissed(true)} // dismisses dialog on backdrop click
        aria-hidden="true" // hides from screen readers
      /> {/* closes backdrop */}

      {/* Centered dialog container panel with accessible ARIA semantics */}
      <div // dialog container element
        ref={dialogRef} // attaches ref for focus trap
        role="dialog" // ARIA dialog role
        aria-modal="true" // marks dialog as modal
        aria-labelledby="tradeoff-dialog-title" // associates title heading
        aria-describedby="tradeoff-dialog-desc" // associates message description
        onKeyDown={handleKeyDown} // captures Tab key for focus trapping
        className="relative w-full max-w-3xl bg-card border border-line rounded-2xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden focus:outline-none" // container styling
        tabIndex={-1} // focusable programmatically
      > {/* dialog panel */}
        {/* Dialog Header with Title, Message, and Dismiss Button */}
        <div className="p-6 border-b border-line bg-sand/30 flex items-start justify-between gap-4"> {/* header container */}
          <div className="space-y-1.5 flex-1 min-w-0"> {/* text container */}
            <div className="flex items-center gap-2"> {/* subtitle row */}
              <span className="w-5 h-5 rounded-md bg-marigold-soft text-warn flex items-center justify-center text-xs" aria-hidden="true"> {/* icon pill */}
                ⚖️ {/* balance scale symbol */}
              </span> {/* closes icon */}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft"> {/* section label */}
                Decision Required {/* context label */}
              </span> {/* closes label */}
            </div> {/* closes subtitle row */}

            <h2 // dialog title heading
              id="tradeoff-dialog-title" // ID referenced by aria-labelledby
              className="text-2xl font-bold text-ink font-display leading-tight" // title typography
            > {/* title text */}
              Your call {/* title specified in prompt */}
            </h2> {/* closes heading */}

            <p // dialog message description
              id="tradeoff-dialog-desc" // ID referenced by aria-describedby
              className="text-sm text-ink-soft leading-relaxed" // message typography
            > {/* message text */}
              {state.tradeoff.message} {/* orchestrator tradeoff message */}
            </p> {/* closes message */}
          </div> {/* closes text container */}

          {/* Accessible dismiss button */}
          <button // close button element
            type="button" // button type
            onClick={() => setIsDismissed(true)} // dismisses dialog
            aria-label="Dismiss trade-off dialog temporarily" // accessible name
            className="p-2 rounded-xl text-ink-soft hover:text-ink hover:bg-sand transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake shrink-0 min-h-11 min-w-11 flex items-center justify-center" // button styling
          > {/* close icon */}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> {/* X shape */}
            </svg> {/* closes SVG */}
          </button> {/* closes button */}
        </div> {/* closes header */}

        {/* Scrollable Body: One Card per Option */}
        <div className="flex-1 overflow-y-auto p-6"> {/* scrollable body container */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5"> {/* responsive options grid */}
            {state.tradeoff.options.map((option, index) => { // iterate over tradeoff options
              // Extract currency from itinerary costs breakdown
              const currency = option.itinerary.costs.currency; // target currency code
              // Compute formatted grand total cost string
              const grandTotalStr = money(option.itinerary.costs.grandTotalMinor, currency); // formatted total money
              // Determine budget delta badge label and styling
              const isOverDelta = option.deltaBudgetMinor > ZERO_DELTA_THRESHOLD; // true when positive delta
              // Format budget delta text
              const deltaLabel = isOverDelta // conditional label
                ? `+${money(option.deltaBudgetMinor, currency)} to the budget` // over budget text
                : "Within your budget"; // within budget text
              // Assign badge CSS classes based on budget delta
              const deltaBadgeClass = isOverDelta // conditional styling
                ? "bg-warn/10 text-warn border-warn/30" // amber warn styling
                : "bg-ok/10 text-ok border-ok/30"; // green ok styling

              return ( // returns option card JSX
                <div // card container
                  key={option.id} // option identifier as React key
                  className="bg-card border border-line rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4" // card styling
                > {/* card body */}
                  <div className="space-y-3"> {/* content group */}
                    {/* Option Top Line: Badge and Option ID */}
                    <div className="flex items-center justify-between gap-2"> {/* top line row */}
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-sand text-ink border border-line"> {/* id pill */}
                        Option {option.id} {/* option identifier */}
                      </span> {/* closes id pill */}

                      {/* Budget Delta Pill */}
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${deltaBadgeClass}`}> {/* delta pill */}
                        {deltaLabel} {/* budget delta text */}
                      </span> {/* closes delta pill */}
                    </div> {/* closes top line row */}

                    {/* Option Title */}
                    <h3 className="text-base font-semibold text-ink font-display leading-snug"> {/* option title heading */}
                      {option.title} {/* option title text */}
                    </h3> {/* closes title */}

                    {/* Option Summary */}
                    <p className="text-xs text-ink-soft leading-relaxed"> {/* option summary paragraph */}
                      {option.summary} {/* option summary text */}
                    </p> {/* closes summary */}

                    {/* Changes List Bullets */}
                    {option.changes.length > EMPTY_LENGTH && ( // conditional render for changes
                      <div className="pt-2 border-t border-line/60 space-y-1.5"> {/* changes container */}
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft block"> {/* changes header */}
                          Key changes: {/* changes label */}
                        </span> {/* closes changes header */}
                        <ul className="space-y-1 text-xs text-ink-soft"> {/* bulleted list */}
                          {option.changes.map((changeText, changeIndex) => ( // iterate over change strings
                            <li key={changeIndex} className="flex items-start gap-2"> {/* bullet item */}
                              <span className="text-lake shrink-0 font-bold" aria-hidden="true">•</span> {/* bullet dot */}
                              <span className="leading-snug">{changeText}</span> {/* change description */}
                            </li> // closes bullet item
                          ))} {/* ends changes map */}
                        </ul> {/* closes bulleted list */}
                      </div> // closes changes container
                    )} {/* ends changes check */}
                  </div> {/* closes content group */}

                  {/* Card Bottom Area: Total Cost and Action Button */}
                  <div className="pt-4 border-t border-line/60 space-y-3"> {/* bottom area */}
                    <div className="flex items-baseline justify-between text-xs"> {/* cost row */}
                      <span className="text-ink-soft font-medium">Total estimated cost:</span> {/* cost label */}
                      <span className="text-base font-bold text-ink font-display">{grandTotalStr}</span> {/* total money value */}
                    </div> {/* closes cost row */}

                    {/* Action Button: Choose this plan */}
                    <button // choose plan button
                      ref={index === FIRST_INDEX ? firstChoiceButtonRef : null} // attaches ref to first button for focus
                      type="button" // button type
                      onClick={() => handleChoose(option.id)} // triggers choice callback
                      className="w-full min-h-11 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-lake hover:bg-lake/90 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer" // button styling
                    > {/* button contents */}
                      Choose this plan {/* button label specified in prompt */}
                    </button> {/* closes button */}
                  </div> {/* closes bottom area */}
                </div> // closes card container
              ); // ends option card return
            })} {/* ends options map */}
          </div> {/* closes options grid */}
        </div> {/* closes scrollable body */}

        {/* Dialog Footer with Secondary Dismiss Action */}
        <div className="p-4 border-t border-line bg-sand/30 flex justify-between items-center text-xs text-ink-soft"> {/* footer bar */}
          <span>Choosing an option updates the itinerary and map immediately.</span> {/* helpful prompt */}
          <button // cancel dismiss button
            type="button" // button type
            onClick={() => setIsDismissed(true)} // dismisses dialog
            className="px-3 py-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-sand border border-line transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake min-h-9" // button styling
          > {/* button label */}
            Decide later {/* dismiss label */}
          </button> {/* closes dismiss button */}
        </div> {/* closes footer */}
      </div> {/* closes dialog container element */}
    </div> // closes full-screen overlay
  ); // ends return
} // ends TradeoffDialog component
