// Import React hooks and keyboard event type definitions
import { useRef, useState, type JSX, type KeyboardEvent } from "react"; // React hooks and event types
// Import PresetCard component for Riya's gift story
import { PresetCard } from "../components/PresetCard.js"; // featured story preset card
// Import TripForm component for user trip input
import { TripForm } from "../components/TripForm.js"; // customizable travel details form
// Import AgentTimeline component to display streaming agent activities
import { AgentTimeline } from "../components/AgentTimeline.js"; // streaming log of agent thoughts and tools
// Import BudgetMeter component to visualize cost versus budget limit
import { BudgetMeter } from "../components/BudgetMeter.js"; // accessible animated cost meter
// Import RuleGrid component to display R0-R8 rule check chips
import { RuleGrid } from "../components/RuleGrid.js"; // hero verification grid for validation rules
// Import TripRequest type for sharing preset values between PresetCard and TripForm
import type { TripRequest } from "../../types/travelverse.js"; // shared trip contract type

// Define supported mobile tab identifiers
type MobileTab = "plan" | "timeline" | "map"; // union of tab identifiers

// Tab configuration item interface
interface TabItem { // describes attributes of each navigation tab
  id: MobileTab; // identifier key
  label: string; // readable button label
  panelId: string; // DOM id of the associated tab panel
} // ends TabItem interface

// List of mobile tabs in display order
const MOBILE_TABS: readonly TabItem[] = [ // array of tab metadata objects
  { id: "plan", label: "Plan", panelId: "panel-plan" }, // planning tab
  { id: "timeline", label: "Timeline", panelId: "panel-timeline" }, // agent activity timeline tab
  { id: "map", label: "Map", panelId: "panel-map" }, // route map tab
]; // ends MOBILE_TABS list

// Constant index offset for shifting to previous tab
const PREV_INDEX_OFFSET = -1; // negative step for moving left
// Constant index offset for shifting to next tab
const NEXT_INDEX_OFFSET = 1; // positive step for moving right
// Constant zero index representing the start of an array
const FIRST_ARRAY_INDEX = 0; // index of first item

// Intent: Render PlannerPage with two-column responsive desktop layout and accessible mobile tabs
export function PlannerPage(): JSX.Element { // exports PlannerPage component
  // Track active mobile tab with 'plan' as initial view
  const [activeTab, setActiveTab] = useState<MobileTab>("plan"); // active mobile tab state
  // Track preset trip to populate TripForm when preset is selected
  const [presetTrip, setPresetTrip] = useState<TripRequest | null>(null); // holds TripRequest from PresetCard
  // Store refs to tab button elements for keyboard navigation management
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]); // array of button refs

  // Handle keyboard navigation between tabs according to ARIA tabs pattern
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => { // keydown event handler
    // Read count of available tabs
    const totalTabs = MOBILE_TABS.length; // total tab items count
    // Variable to hold the calculated target tab index
    let nextIndex = currentIndex; // initialized to current index

    // Handle Left Arrow key: navigate to previous tab with wrap-around
    if (event.key === "ArrowLeft") { // left arrow check
      event.preventDefault(); // prevents browser scroll
      nextIndex = (currentIndex + PREV_INDEX_OFFSET + totalTabs) % totalTabs; // modulo arithmetic for circular shift
    } else if (event.key === "ArrowRight") { // right arrow check
      event.preventDefault(); // prevents browser scroll
      nextIndex = (currentIndex + NEXT_INDEX_OFFSET) % totalTabs; // modulo arithmetic for circular forward shift
    } else if (event.key === "Home") { // home key check
      event.preventDefault(); // prevents browser scroll
      nextIndex = FIRST_ARRAY_INDEX; // jumps to first tab
    } else if (event.key === "End") { // end key check
      event.preventDefault(); // prevents browser scroll
      nextIndex = totalTabs + PREV_INDEX_OFFSET; // jumps to last tab
    } else { // any other key
      return; // unhandled key: exit early
    } // ends key conditions

    // Find target tab item from array
    const targetTab = MOBILE_TABS[nextIndex]; // reads target tab definition
    // Update active tab state
    setActiveTab(targetTab.id); // switches active tab
    // Focus corresponding tab button element in the DOM
    tabRefs.current[nextIndex]?.focus(); // brings focus to new tab
  }; // ends handleKeyDown

  // Render PlannerPage layout
  return ( // returns page JSX
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"> {/* page wrapper with centered max width */}
      {/* Mobile Tablist Navigation Bar - Visible only on screens smaller than lg breakpoint */}
      <div className="lg:hidden mb-6"> {/* container hidden on large desktop */}
        <div // tablist element
          role="tablist" // ARIA tablist role
          aria-label="Planning sections" // accessible name for the tablist
          className="flex border-b border-line bg-card rounded-xl p-1 shadow-sm" // tablist styling
        > {/* tab buttons */}
          {MOBILE_TABS.map((tab, index) => { // iterate over tab configurations
            const isActive = activeTab === tab.id; // check active state
            return ( // returns tab button
              <button // tab button element
                key={tab.id} // React key
                ref={(el) => { tabRefs.current[index] = el; }} // captures DOM element ref
                id={`tab-${tab.id}`} // unique tab id
                role="tab" // ARIA tab role
                type="button" // button type
                aria-selected={isActive} // ARIA selected boolean
                aria-controls={tab.panelId} // associates tab with panel
                tabIndex={isActive ? 0 : -1} // manages roving tabindex
                onClick={() => setActiveTab(tab.id)} // click handler to select tab
                onKeyDown={(e) => handleKeyDown(e, index)} // keyboard navigation handler
                className={`min-h-11 flex-1 py-2 px-3 text-sm font-medium rounded-lg text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer ${ // button styling
                  isActive // active conditional styling
                    ? "bg-lake text-white shadow-sm font-semibold" // active tab colors
                    : "text-ink-soft hover:text-ink hover:bg-sand/60" // inactive tab colors
                }`} // closes template string
              > {/* button label */}
                {tab.label} {/* tab name */}
              </button> // closes tab button
            ); // ends return
          })} {/* ends map */}
        </div> {/* closes tablist */}
      </div> {/* closes mobile tabs container */}

      {/* Main Content Layout Grid */}
      <div className="flex flex-col lg:flex-row gap-6 items-start"> {/* responsive two-column flex container */}
        {/* Left Column (Desktop 400px fixed width): Preset Card, Trip Form, and Agent Timeline */}
        <div className="w-full lg:w-[400px] shrink-0 space-y-6"> {/* left column container */}
          {/* Plan Tab Panel for mobile, always rendered on desktop */}
          <div // panel wrapper
            id="panel-plan" // panel id matching tab aria-controls
            role="tabpanel" // ARIA tabpanel role
            aria-labelledby="tab-plan" // associates with plan tab
            className={`space-y-6 ${activeTab === "plan" ? "block" : "hidden lg:block"}`} // conditionally visible on mobile, always on desktop
          > {/* plan panel contents */}
            {/* Riya's gift featured preset card */}
            <PresetCard onSelectPreset={(trip) => setPresetTrip(trip)} /> {/* renders preset card */}
            {/* Customizable trip request form */}
            <TripForm presetTrip={presetTrip} /> {/* renders trip form */}
          </div> {/* closes plan panel */}

          {/* Timeline Tab Panel for mobile, always placed in left column on desktop */}
          <div // panel wrapper
            id="panel-timeline" // panel id matching tab aria-controls
            role="tabpanel" // ARIA tabpanel role
            aria-labelledby="tab-timeline" // associates with timeline tab
            className={`space-y-6 ${ // layout spacing between meter, grid, and timeline
              activeTab === "timeline" ? "block" : "hidden lg:block" // conditionally visible on mobile, always on desktop
            }`} // closes class string
          > {/* timeline panel contents */}
            {/* Rule verification grid hero visual */}
            <RuleGrid /> {/* renders R0-R8 validation chip rows */}
            {/* Dynamic budget progress meter */}
            <BudgetMeter /> {/* renders cost versus budget meter bar */}
            {/* Real-time streaming agent activity log */}
            <AgentTimeline /> {/* renders streaming thought and tool timeline */}
          </div> {/* closes timeline panel */}
        </div> {/* closes left column */}

        {/* Right Column (Desktop flexible remaining width): Itinerary above Map */}
        <div className={`w-full flex-1 space-y-6 ${activeTab === "map" ? "block" : "hidden lg:block"}`}> {/* right column responsive visibility */}
          {/* Itinerary Section: placeholder for P13 */}
          <div // itinerary card wrapper
            className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-3" // card styling
          > {/* itinerary card contents */}
            <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
              <div> {/* title group */}
                <h3 className="text-base font-semibold text-ink font-display"> {/* title */}
                  Itinerary {/* heading text */}
                </h3> {/* closes heading */}
                <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
                  Curated days with proven accessibility and deterministic cost breakdown {/* explanation */}
                </p> {/* closes description */}
              </div> {/* closes title group */}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sand text-ink-soft border border-line"> {/* badge */}
                P13 {/* milestone indicator */}
              </span> {/* closes badge */}
            </div> {/* closes header row */}
            <div className="py-12 flex flex-col items-center justify-center text-center text-ink-soft space-y-2 border border-dashed border-line rounded-xl bg-sand/30"> {/* placeholder box */}
              <p className="text-sm font-medium text-ink"> {/* placeholder title */}
                Itinerary preview coming in P13 {/* placeholder text */}
              </p> {/* closes title */}
              <p className="text-xs max-w-sm"> {/* placeholder description */}
                Once planning starts, your day-by-day plan with verified step-free venues and hotel stays will render here. {/* placeholder details */}
              </p> {/* closes description */}
            </div> {/* closes placeholder box */}
          </div> {/* closes itinerary card */}

          {/* Map Section: Visible on desktop and on mobile 'map' tab, placeholder for P14 */}
          <div // map panel wrapper
            id="panel-map" // panel id matching tab aria-controls
            role="tabpanel" // ARIA tabpanel role
            aria-labelledby="tab-map" // associates with map tab
            className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-3" // card styling
          > {/* map card contents */}
            <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
              <div> {/* title group */}
                <h3 className="text-base font-semibold text-ink font-display"> {/* title */}
                  Map {/* heading text */}
                </h3> {/* closes heading */}
                <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
                  Visual route with OSRM transit calculations and terrain contours {/* explanation */}
                </p> {/* closes description */}
              </div> {/* closes title group */}
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sand text-ink-soft border border-line"> {/* badge */}
                P14 {/* milestone indicator */}
              </span> {/* closes badge */}
            </div> {/* closes header row */}
            <div className="py-16 flex flex-col items-center justify-center text-center text-ink-soft space-y-2 border border-dashed border-line rounded-xl bg-sand/30"> {/* placeholder box */}
              <p className="text-sm font-medium text-ink"> {/* placeholder title */}
                Map visualization coming in P14 {/* placeholder text */}
              </p> {/* closes title */}
              <p className="text-xs max-w-sm"> {/* placeholder description */}
                Venues, daily transit tracks, and step-free walking paths will be plotted on an interactive map. {/* placeholder details */}
              </p> {/* closes description */}
            </div> {/* closes placeholder box */}
          </div> {/* closes map card */}
        </div> {/* closes right column */}
      </div> {/* closes main content layout */}
    </div> // closes page wrapper
  ); // ends return
} // ends PlannerPage component
