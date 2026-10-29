// Import React core hooks, references, and JSX types
import { useEffect, useRef, type JSX, type KeyboardEvent } from "react"; // React hooks for lifecycle and DOM management
// Import Evidence, StepFreeStatus types from shared domain contracts
import type { Evidence, StepFreeStatus } from "../../types/travelverse.js"; // domain types

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

// Map of evidence methods to human readable labels as requested in specification
const METHOD_LABELS: Record<Evidence["method"], string> = { // maps method enum to readable strings
  tavily_extract: "Official page via Tavily Extract", // Tavily Extract web scraping method
  curated: "Curated source", // human curated dataset method
  osm_tag: "OpenStreetMap wheelchair tag", // OpenStreetMap tag method
}; // ends METHOD_LABELS

// Map of step-free status enum to human readable strings
const STEP_FREE_LABEL: Record<StepFreeStatus, string> = { // maps status to UI display label
  step_free: "Step-free", // fully accessible
  partial: "Partly step-free", // partially accessible
  not_step_free: "Not step-free", // not accessible
  unverified: "Unverified", // unverified status
}; // ends STEP_FREE_LABEL

// Interface describing the target place or lodging entity displayed in EvidenceDrawer
export interface EvidenceTarget { // entity specification for evidence drawer
  id: string; // target place or lodging identifier
  name: string; // place name or hotel name
  stepFree: StepFreeStatus; // overall accessibility status
  evidence: Evidence[]; // list of evidence records
  isLodging?: boolean; // flag indicating hotel lodging versus visit stop
} // ends EvidenceTarget interface

// Props interface for EvidenceDrawer component
export interface EvidenceDrawerProps { // props specification
  isOpen: boolean; // boolean controlling drawer visibility
  target: EvidenceTarget | null; // active entity whose evidence is displayed
  onClose: () => void; // callback handler to close the drawer
} // ends EvidenceDrawerProps interface

// Intent: Render accessible modal evidence drawer with focus trap, backdrop click, Escape handling, and focus restoration
export function EvidenceDrawer({ // exports EvidenceDrawer component
  isOpen, // visibility state
  target, // active target entity
  onClose, // close callback handler
}: EvidenceDrawerProps): JSX.Element | null { // returns JSX or null
  // Ref to hold the dialog DOM element
  const drawerRef = useRef<HTMLDivElement | null>(null); // DOM ref to dialog container
  // Ref to hold the previously focused element prior to drawer opening
  const previousFocusRef = useRef<HTMLElement | null>(null); // DOM ref to trigger element
  // Ref to close button element for initial focus
  const closeButtonRef = useRef<HTMLButtonElement | null>(null); // DOM ref to close button

  // Manage focus capture, body scroll locking, and Escape key listener
  useEffect(() => { // lifecycle hook when drawer open state changes
    // Guard: only execute when drawer is transitioning to open state
    if (isOpen) { // drawer is open
      // Capture currently focused element in the document to restore focus later
      previousFocusRef.current = document.activeElement as HTMLElement | null; // saves trigger element
      // Prevent background scrolling while modal drawer is active
      const originalOverflow = document.body.style.overflow; // preserves original overflow style
      document.body.style.overflow = "hidden"; // locks body scroll

      // Focus the close button when the drawer opens to establish initial focus
      const focusTimer = setTimeout(() => { // timeout allows animation frame to mount DOM
        closeButtonRef.current?.focus(); // focuses close button
      }, FIRST_INDEX); // zero timeout for next tick

      // Handle Escape key globally while drawer is open
      const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => { // global keyboard listener
        if (event.key === ESCAPE_KEY) { // checks for escape key
          event.preventDefault(); // prevents default browser action
          onClose(); // triggers close callback
        } // ends escape check
      }; // ends handleGlobalKeyDown

      // Register escape keydown listener on window
      window.addEventListener("keydown", handleGlobalKeyDown); // adds listener

      // Cleanup function when drawer closes or unmounts
      return () => { // cleanup function
        document.body.style.overflow = originalOverflow; // restores body scroll
        clearTimeout(focusTimer); // clears timeout
        window.removeEventListener("keydown", handleGlobalKeyDown); // removes escape listener
        // Restore focus back to the triggering element
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") { // check trigger
          previousFocusRef.current.focus(); // brings focus back to trigger
        } // ends focus restoration
      }; // ends cleanup
    } // ends isOpen check
  }, [isOpen, onClose]); // re-runs when isOpen changes

  // Handle Tab and Shift-Tab inside the drawer to trap focus within modal dialog
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => { // keyboard trap handler
    // Guard: only trap Tab key
    if (event.key !== TAB_KEY) { // check if key is not Tab
      return; // ignore non-tab keys
    } // ends check

    // Find all focusable elements inside the drawer container
    if (!drawerRef.current) { // check if drawer ref is available
      return; // exit if not mounted
    } // ends ref check

    // Query focusable elements list
    const focusableElements = Array.from( // converts NodeList to array
      drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS_SELECTOR) // queries focusable elements
    ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"); // filters out disabled or hidden elements

    // If no focusable elements found, prevent tabbing away
    if (focusableElements.length === EMPTY_LENGTH) { // empty elements check
      event.preventDefault(); // prevents focus loss
      return; // exit early
    } // ends check

    // Identify first and last focusable elements in drawer
    const firstElement = focusableElements[FIRST_INDEX]; // first focusable element
    const lastElement = focusableElements[focusableElements.length - LAST_INDEX_OFFSET]; // last focusable element

    // Handle Shift-Tab backward navigation
    if (event.shiftKey) { // shift key pressed
      if (document.activeElement === firstElement) { // currently at first element
        event.preventDefault(); // prevents leaving modal
        lastElement?.focus(); // wraps focus to last element
      } // ends first element check
    } else { // forward Tab navigation
      if (document.activeElement === lastElement) { // currently at last element
        event.preventDefault(); // prevents leaving modal
        firstElement?.focus(); // wraps focus to first element
      } // ends last element check
    } // ends tab direction check
  }; // ends handleKeyDown

  // Guard: return null when drawer is closed or target is null
  if (!isOpen || !target) { // check if drawer should be hidden
    return null; // renders nothing
  } // ends guard

  // Determine target status chip styling
  let statusBadgeClasses = "bg-sand text-ink-soft border-line"; // default grey unverified colors
  if (target.stepFree === "step_free") { // step_free green
    statusBadgeClasses = "bg-ok/10 text-ok border-ok/30"; // green styling
  } else if (target.stepFree === "partial") { // partial amber
    statusBadgeClasses = "bg-warn/10 text-warn border-warn/30"; // amber styling
  } else if (target.stepFree === "not_step_free") { // not_step_free red
    statusBadgeClasses = "bg-bad/10 text-bad border-bad/30"; // red styling
  } // ends status conditions

  // Render modal drawer overlay and panel
  return ( // returns JSX
    <div className="fixed inset-0 z-50 flex justify-end" aria-live="assertive"> {/* fixed wrapper */}
      {/* Semi-transparent backdrop overlay with blur */}
      <div // backdrop element
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity" // overlay styling
        onClick={onClose} // closes drawer on backdrop click
        aria-hidden="true" // hides from screen readers
      /> {/* closes backdrop */}

      {/* Slide-out drawer panel with accessible dialog semantics */}
      <div // drawer container element
        ref={drawerRef} // attaches ref for focus trap
        role="dialog" // ARIA dialog role
        aria-modal="true" // marks dialog as modal
        aria-labelledby="evidence-drawer-title" // associates title heading
        onKeyDown={handleKeyDown} // captures Tab key for focus trapping
        className="relative w-full max-w-md bg-card border-l border-line shadow-2xl h-full flex flex-col z-10 overflow-hidden focus:outline-none" // drawer styling
        tabIndex={-1} // focusable programmatically
      > {/* drawer layout */}
        {/* Drawer Header with Title, Status Chip, and Accessible Close Button */}
        <div className="p-5 border-b border-line bg-sand/30 flex items-start justify-between gap-4"> {/* header container */}
          <div className="space-y-1.5 flex-1 min-w-0"> {/* title container */}
            <div className="flex items-center gap-2"> {/* subtitle row */}
              <span className="w-5 h-5 rounded-md bg-lake-soft text-lake flex items-center justify-center text-xs" aria-hidden="true"> {/* icon pill */}
                ♿ {/* wheelchair symbol */}
              </span> {/* closes icon */}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft"> {/* section label */}
                {target.isLodging ? "Hotel Accessibility" : "Stop Accessibility"} {/* context label */}
              </span> {/* closes label */}
            </div> {/* closes subtitle row */}

            <h2 // dialog title heading
              id="evidence-drawer-title" // ID referenced by aria-labelledby
              className="text-lg font-bold text-ink font-display leading-tight truncate" // title typography
              title={target.name} // browser tooltip for long names
            > {/* target name */}
              {target.name} {/* name of the place or lodging */}
            </h2> {/* closes heading */}

            {/* Target Status Chip */}
            <div className="pt-0.5"> {/* chip wrapper */}
              <span // status pill
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadgeClasses}`} // badge styling
              > {/* badge contents */}
                {target.stepFree === "step_free" ? ( // checkmark icon
                  <svg className="w-3.5 h-3.5 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
                  </svg> // closes SVG
                ) : target.stepFree === "partial" ? ( // alert icon
                  <svg className="w-3.5 h-3.5 shrink-0 text-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> {/* alert shape */}
                  </svg> // closes SVG
                ) : target.stepFree === "not_step_free" ? ( // prohibited slash icon
                  <svg className="w-3.5 h-3.5 shrink-0 text-bad" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /> {/* slash shape */}
                  </svg> // closes SVG
                ) : ( // info icon
                  <svg className="w-3.5 h-3.5 shrink-0 text-ink-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> {/* info shape */}
                  </svg> // closes SVG
                )} {/* ends icon condition */}
                <span>{STEP_FREE_LABEL[target.stepFree] ?? "Unverified"}</span> {/* status text */}
              </span> {/* closes pill */}
            </div> {/* closes chip wrapper */}
          </div> {/* closes title container */}

          {/* Close button with accessible name */}
          <button // close button
            ref={closeButtonRef} // captures ref for initial focus
            type="button" // button type
            onClick={onClose} // triggers close handler
            aria-label="Close evidence drawer" // accessible name
            className="p-2 rounded-xl text-ink-soft hover:text-ink hover:bg-sand transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake shrink-0 min-h-11 min-w-11 flex items-center justify-center" // button styling
          > {/* close button icon */}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> {/* X shape */}
            </svg> {/* closes SVG */}
          </button> {/* closes close button */}
        </div> {/* closes header */}

        {/* Scrollable Evidence Items Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4"> {/* scrollable container */}
          {target.evidence.length === EMPTY_LENGTH ? ( // check if evidence list is empty
            <div className="p-6 text-center border border-dashed border-line rounded-xl bg-sand/30 space-y-2"> {/* empty box */}
              <p className="text-sm font-semibold text-ink"> {/* empty title */}
                No Evidence Records Available {/* title text */}
              </p> {/* closes title */}
              <p className="text-xs text-ink-soft leading-relaxed"> {/* empty description */}
                This stop has not yet been checked against official web pages or curated sources. {/* message */}
              </p> {/* closes description */}
            </div> // closes empty box
          ) : ( // evidence items exist
            target.evidence.map((item, index) => { // iterate through evidence items
              // Resolve readable method label
              const methodLabel = METHOD_LABELS[item.method] ?? item.method; // lookup method label

              return ( // returns evidence item card JSX
                <div // card container
                  key={`${item.targetId}-${item.method}-${index}`} // unique React key
                  className="bg-card border border-line rounded-xl p-4 shadow-sm space-y-3" // card styling
                > {/* card contents */}
                  {/* Top line with method label and official status */}
                  <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2"> {/* method header */}
                    <span className="text-xs font-semibold text-ink"> {/* method label */}
                      {methodLabel} {/* readable method label */}
                    </span> {/* closes method label */}
                    {item.official && ( // official tag when official is true
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-lake/10 text-lake border border-lake/20 shrink-0"> {/* official pill */}
                        official {/* official tag */}
                      </span> // closes official pill
                    )} {/* ends official check */}
                  </div> {/* closes method header */}

                  {/* Verbatim quote in blockquote element */}
                  {item.quote && ( // check if quote is provided
                    <blockquote className="border-l-4 border-lake/40 pl-3 py-1.5 italic text-xs leading-relaxed text-ink bg-sand/50 rounded-r-lg"> {/* quote container */}
                      "{item.quote}" {/* quote text */}
                    </blockquote> // closes blockquote
                  )} {/* ends quote check */}

                  {/* Domain, link, and retrieved date line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1"> {/* links and dates row */}
                    {item.url ? ( // check if source URL is provided
                      <a // source link
                        href={item.url} // link URL
                        target="_blank" // new tab
                        rel="noopener noreferrer" // security attributes
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-lake hover:underline truncate max-w-[240px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lake" // link styling
                        title={`Visit ${item.domain ?? item.url}`} // tooltip
                      > {/* link contents */}
                        <span>{item.domain ?? item.url}</span> {/* domain label */}
                        <span aria-hidden="true">↗</span> {/* external link arrow */}
                      </a> // closes link
                    ) : item.domain ? ( // domain without url
                      <span className="font-mono text-[11px] text-ink-soft"> {/* domain span */}
                        {item.domain} {/* domain text */}
                      </span> // closes span
                    ) : null} {/* ends domain check */}

                    {/* Retrieved date label */}
                    <span className="text-[11px] text-ink-soft shrink-0"> {/* date span */}
                      retrieved {item.retrievedAt} {/* retrieved date string */}
                    </span> {/* closes date span */}
                  </div> {/* closes links and dates row */}

                  {/* "Quote verified on the page" ONLY when verbatimVerified is true */}
                  {item.verbatimVerified && ( // strict verbatim verification check
                    <div className="flex items-center gap-1.5 text-xs text-ok font-semibold pt-1 border-t border-line/40"> {/* verified notice */}
                      <svg className="w-3.5 h-3.5 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* checkmark SVG */}
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
                      </svg> {/* closes SVG */}
                      <span>Quote verified on the page</span> {/* required verbatim verified text */}
                    </div> // closes verified notice
                  )} {/* ends verbatimVerified check */}
                </div> // closes card container
              ); // ends return
            }) // ends evidence map
          )} {/* ends evidence items ternary */}
        </div> {/* closes scrollable body */}

        {/* Drawer Footer with Close Action */}
        <div className="p-4 border-t border-line bg-sand/30 flex justify-end"> {/* footer bar */}
          <button // done button
            type="button" // button type
            onClick={onClose} // closes drawer
            className="px-4 py-2 text-xs font-semibold text-ink bg-card border border-line rounded-xl hover:bg-sand shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake min-h-11" // button styling
          > {/* button label */}
            Done {/* label text */}
          </button> {/* closes done button */}
        </div> {/* closes footer */}
      </div> {/* closes drawer container */}
    </div> // closes fixed wrapper
  ); // ends return
} // ends EvidenceDrawer component
