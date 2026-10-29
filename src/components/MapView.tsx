// Import React core hooks and type definitions
import { useEffect, useMemo, useRef, type JSX } from "react"; // React hooks and JSX return type
// Import Leaflet core library for divIcon and LatLngBounds
import L from "leaflet"; // Leaflet map library
// Import React Leaflet components and hooks
import { MapContainer, TileLayer, Marker, Polyline, Popup, Tooltip, useMap } from "react-leaflet"; // Leaflet React wrappers
// Import shared global run context hook
import { useRun } from "../state/RunProvider.js"; // agent state and selected day state
// Import UI display helpers for money and accessibility labels
import { money, STEP_FREE_LABEL } from "../lib/format.js"; // currency and status text formatters
// Import domain contract types
import type { FinalItinerary, VisitItem } from "../../types/travelverse.js"; // types for itinerary and visits

// Define seven distinct accessible day colors corresponding to dayIndex (0 through 6)
export const DAY_COLORS = [ // array of color strings
  "#1d4e89", // Day 1: deep lake blue
  "#e8a33d", // Day 2: warm marigold orange
  "#2e7d32", // Day 3: forest green
  "#8e44ad", // Day 4: royal purple
  "#c0392b", // Day 5: terracotta red
  "#16a085", // Day 6: sea green
  "#7f8c8d", // Day 7: slate gray
] as const; // immutable color palette

// Define OpenStreetMap tile URL template
const TILE_LAYER_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"; // tile server URL
// Define maximum supported zoom level for OpenStreetMap
const TILE_LAYER_MAX_ZOOM = 19; // maximum tile resolution
// Define OpenStreetMap copyright attribution HTML string
const TILE_LAYER_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'; // attribution notice
// Define diameter in pixels for circular marker icons
const MARKER_SIZE_PX = 28; // circle width and height
// Define center anchor offset in pixels for marker placement
const MARKER_ANCHOR_PX = 14; // half width for precise pin centering
// Define popup vertical offset in pixels relative to marker anchor
const POPUP_OFFSET_Y_PX = -14; // popup appears directly above circle
// Define line weight in pixels for daily route polyline paths
const POLYLINE_WEIGHT_PX = 3; // stroke width of transit lines
// Define opacity value for the currently selected day's route line
const OPACITY_SELECTED = 1.0; // fully opaque line
// Define opacity value for unselected days to de-emphasize them
const OPACITY_UNSELECTED = 0.35; // dimmed transparent line
// Define viewport padding in pixels when fitting all or day coordinates
const BOUNDS_PADDING_PX = 32; // breathing room around map edges
// Define maximum zoom level when executing fitBounds
const FIT_BOUNDS_MAX_ZOOM = 16; // prevents extreme over-zooming on single points
// Define standard initial fallback map zoom level
const DEFAULT_MAP_ZOOM = 13; // default city overview zoom
// Define informative route tooltip text explaining straight-line depiction
const ROUTE_TOOLTIP_TEXT = "Straight-line view; times use road distances"; // polyline tooltip text
// Define zero index for array offset arithmetic
const ZERO_INDEX = 0; // index zero constant
// Define one increment constant for 1-based stop numbering
const ONE_INCREMENT = 1; // addition step constant
// Define house icon vector dimension in pixels
const HOUSE_ICON_SIZE_PX = 15; // width and height of interior house SVG
// Define house SVG vector line stroke thickness
const HOUSE_STROKE_WIDTH = 2.2; // line thickness constant

// Intent: Construct Leaflet DivIcon for the trip lodging hotel with white background and ink house icon
const HOTEL_DIV_ICON: L.DivIcon = L.divIcon({ // static hotel marker icon
  className: "custom-hotel-marker", // transparent container class
  html: `<div style="width:${MARKER_SIZE_PX}px;height:${MARKER_SIZE_PX}px;border-radius:9999px;background-color:#ffffff;border:2px solid #1c1b1a;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.25);"><svg width="${HOUSE_ICON_SIZE_PX}" height="${HOUSE_ICON_SIZE_PX}" viewBox="0 0 24 24" fill="none" stroke="#1c1b1a" stroke-width="${HOUSE_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5h-4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/></svg></div>`, // HTML circle with house SVG
  iconSize: [MARKER_SIZE_PX, MARKER_SIZE_PX], // dimensions tuple
  iconAnchor: [MARKER_ANCHOR_PX, MARKER_ANCHOR_PX], // center alignment tuple
  popupAnchor: [ZERO_INDEX, POPUP_OFFSET_Y_PX], // popup position tuple
}); // closes HOTEL_DIV_ICON

// Intent: Cache and generate DivIcon for a stop order number styled with the day's theme color
function getStopIcon(stopOrder: number, dayIndex: number): L.DivIcon { // icon factory function
  // Select day color based on modulo of day index
  const color = DAY_COLORS[dayIndex % DAY_COLORS.length]; // day color string
  // Return configured Leaflet DivIcon with white text inside colored circle
  return L.divIcon({ // creates div icon instance
    className: "custom-stop-marker", // custom class without default border
    html: `<div style="width:${MARKER_SIZE_PX}px;height:${MARKER_SIZE_PX}px;border-radius:9999px;background-color:${color};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.25);font-family:Inter,system-ui,sans-serif;">${stopOrder}</div>`, // circular marker html
    iconSize: [MARKER_SIZE_PX, MARKER_SIZE_PX], // icon size tuple
    iconAnchor: [MARKER_ANCHOR_PX, MARKER_ANCHOR_PX], // center pin tuple
    popupAnchor: [ZERO_INDEX, POPUP_OFFSET_Y_PX], // popup vertical alignment tuple
  }); // ends divIcon
} // ends getStopIcon

// Props interface for FitBounds subcomponent
interface FitBoundsProps { // describes FitBounds parameters
  itinerary: FinalItinerary; // active itinerary object
  selectedDay: number | null; // active day index or null for all days
} // ends FitBoundsProps

// Intent: Automatically adjust map view to fit all markers on itinerary update, and pan to selected day bounds
function FitBounds({ itinerary, selectedDay }: FitBoundsProps): null { // headless map controller component
  // Access underlying Leaflet map instance from React Leaflet context
  const map = useMap(); // Leaflet map reference
  // Ref tracking previous itinerary reference to distinguish trip updates from day switches
  const prevItineraryRef = useRef<FinalItinerary | null>(null); // holds past itinerary reference
  // Ref tracking previous selected day state
  const prevSelectedDayRef = useRef<number | null | undefined>(undefined); // holds past selectedDay value

  // Effect to handle bounds calculations whenever itinerary or selectedDay changes
  useEffect(() => { // lifecycle hook
    // Request Leaflet to recheck DOM dimensions after mounting or layout shifts
    map.invalidateSize(); // recalculates map size

    // Determine if itinerary instance has changed
    const isItineraryChanged = prevItineraryRef.current !== itinerary; // itinerary identity comparison
    // Determine if user switched the selected day
    const isSelectedDayChanged = prevSelectedDayRef.current !== selectedDay; // selected day comparison

    // When the itinerary itself changes, fit map to enclose all points across the entire trip
    if (isItineraryChanged) { // itinerary change branch
      prevItineraryRef.current = itinerary; // updates cached itinerary
      prevSelectedDayRef.current = selectedDay; // updates cached day

      // Array holding all coordinate pairs starting with lodging location
      const allPoints: [number, number][] = [ // coordinate list
        [itinerary.lodging.location.lat, itinerary.lodging.location.lon], // lodging coordinate
      ]; // initializes with hotel

      // Iterate through all days in the itinerary
      for (const day of itinerary.days) { // loop days
        // Iterate through all items in the day
        for (const item of day.items) { // loop items
          // Check if item is a visit location
          if (item.kind === "visit") { // visit filter
            allPoints.push([item.location.lat, item.location.lon]); // appends visit coordinate
          } // ends visit check
        } // ends item loop
      } // ends day loop

      // Fit map viewport to enclose all collected points if coordinates exist
      if (allPoints.length > ZERO_INDEX) { // non-empty check
        const bounds = L.latLngBounds(allPoints); // constructs LatLngBounds
        if (bounds.isValid()) { // validity guard
          map.fitBounds(bounds, { // fits viewport to bounds
            padding: [BOUNDS_PADDING_PX, BOUNDS_PADDING_PX], // boundary padding
            maxZoom: FIT_BOUNDS_MAX_ZOOM, // zoom cap
          }); // ends fitBounds
        } // ends validity check
      } // ends non-empty check
      return; // exits handler
    } // ends itinerary change branch

    // When selected day changes, fit or pan to the selected day's bounds
    if (isSelectedDayChanged) { // day change branch
      prevSelectedDayRef.current = selectedDay; // updates cached day

      // Check if a specific day is selected
      if (selectedDay !== null) { // specific day check
        // Find corresponding day plan
        const targetDay = itinerary.days.find((day) => day.dayIndex === selectedDay); // finds matching day
        if (targetDay) { // day found guard
          // Array holding coordinates for this day starting with hotel
          const dayPoints: [number, number][] = [ // day coordinate list
            [itinerary.lodging.location.lat, itinerary.lodging.location.lon], // lodging coordinate
          ]; // initializes with hotel

          // Collect all visit coordinates for this day
          for (const item of targetDay.items) { // loop day items
            if (item.kind === "visit") { // visit item check
              dayPoints.push([item.location.lat, item.location.lon]); // appends visit coordinate
            } // ends visit check
          } // ends item loop

          // Fit map viewport to this day's points
          if (dayPoints.length > ZERO_INDEX) { // non-empty check
            const dayBounds = L.latLngBounds(dayPoints); // constructs day bounds
            if (dayBounds.isValid()) { // validity check
              map.fitBounds(dayBounds, { // fits to day bounds
                padding: [BOUNDS_PADDING_PX, BOUNDS_PADDING_PX], // boundary padding
                maxZoom: FIT_BOUNDS_MAX_ZOOM, // zoom cap
              }); // ends fitBounds
            } // ends validity check
          } // ends non-empty check
        } // ends targetDay check
      } else { // all days selected branch
        // Reset view to enclose all trip coordinates
        const allPoints: [number, number][] = [ // all coordinate list
          [itinerary.lodging.location.lat, itinerary.lodging.location.lon], // lodging coordinate
        ]; // initializes with hotel

        for (const day of itinerary.days) { // loop days
          for (const item of day.items) { // loop items
            if (item.kind === "visit") { // visit check
              allPoints.push([item.location.lat, item.location.lon]); // appends coordinate
            } // ends visit check
          } // ends item loop
        } // ends day loop

        if (allPoints.length > ZERO_INDEX) { // non-empty check
          const bounds = L.latLngBounds(allPoints); // constructs bounds
          if (bounds.isValid()) { // validity check
            map.fitBounds(bounds, { // fits to all points
              padding: [BOUNDS_PADDING_PX, BOUNDS_PADDING_PX], // boundary padding
              maxZoom: FIT_BOUNDS_MAX_ZOOM, // zoom cap
            }); // ends fitBounds
          } // ends validity check
        } // ends non-empty check
      } // ends else
    } // ends day change branch
  }, [map, itinerary, selectedDay]); // re-runs on map, itinerary, or selectedDay change

  // Return null as FitBounds is a headless utility component
  return null; // renders nothing directly to DOM
} // ends FitBounds component

// Intent: Render calm placeholder card when no itinerary is present
function EmptyStateMap(): JSX.Element { // helper empty state component
  // Render placeholder interface styled with warm sand tones and dashed border
  return ( // returns empty state JSX
    <div className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-4"> {/* card container */}
      <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
        <div> {/* title group */}
          <h3 className="text-base font-semibold text-ink font-display"> {/* title */}
            Map {/* heading text */}
          </h3> {/* closes title */}
          <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
            Visual route with hotel, stops, and daily itineraries {/* explanation */}
          </p> {/* closes description */}
        </div> {/* closes title group */}
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sand text-ink-soft border border-line"> {/* badge */}
          Interactive {/* badge label */}
        </span> {/* closes badge */}
      </div> {/* closes header row */}
      <div className="h-[60vh] lg:h-[420px] w-full rounded-2xl border border-dashed border-line bg-sand/30 flex flex-col items-center justify-center text-center p-6 space-y-3"> {/* placeholder box */}
        <div className="w-12 h-12 rounded-full bg-sand border border-line flex items-center justify-center text-ink-soft shadow-xs"> {/* icon circle */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"> {/* map vector icon */}
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /> {/* folded map polygon */}
            <line x1="9" y1="3" x2="9" y2="18" /> {/* left fold line */}
            <line x1="15" y1="6" x2="15" y2="21" /> {/* right fold line */}
          </svg> {/* closes svg */}
        </div> {/* closes icon circle */}
        <div className="space-y-1"> {/* text group */}
          <p className="text-sm font-medium text-ink"> {/* message headline */}
            Map route will appear with your itinerary {/* empty headline */}
          </p> {/* closes headline */}
          <p className="text-xs text-ink-soft max-w-sm"> {/* message explanation */}
            Stops, lodging, and daily routes will be plotted here once planning begins. {/* empty explanation */}
          </p> {/* closes explanation */}
        </div> {/* closes text group */}
      </div> {/* closes placeholder box */}
    </div> // closes card container
  ); // ends return
} // ends EmptyStateMap

// Intent: Main MapView component plotting Leaflet tiles, day-colored stop circles, hotel marker, and daily polyline loops
export function MapView(): JSX.Element { // exports MapView component
  // Extract run state, active selected day, and day updater from shared context
  const { state, selectedDay, setSelectedDay } = useRun(); // reads context

  // Resolve active itinerary: final plan takes precedence, followed by working draft
  const itinerary = state.final ?? state.draft; // active FinalItinerary or null

  // Pre-calculate initial center coordinates from hotel lodging
  const initialCenter = useMemo<[number, number]>(() => { // computes memoized center
    if (itinerary?.lodging?.location) { // checks lodging coordinate
      return [itinerary.lodging.location.lat, itinerary.lodging.location.lon]; // lodging lat/lon tuple
    } // ends check
    return [24.5854, 73.7125]; // fallback center for Udaipur
  }, [itinerary]); // recomputes when itinerary changes

  // Guard against missing itinerary: render calm empty state placeholder
  if (!itinerary) { // checks if itinerary is absent
    return <EmptyStateMap />; // renders calm placeholder card
  } // ends guard

  // Render complete interactive map card
  return ( // returns map JSX
    <div className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-4"> {/* card container */}
      {/* Header bar with title, subtitle, and day selection filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3"> {/* header wrapper */}
        <div> {/* title section */}
          <h3 className="text-base font-semibold text-ink font-display"> {/* title */}
            Map {/* heading text */}
          </h3> {/* closes heading */}
          <p className="text-xs text-ink-soft mt-0.5"> {/* description */}
            {itinerary.destinationName} • {itinerary.days.length} days • {itinerary.lodging.name} {/* trip details */}
          </p> {/* closes description */}
        </div> {/* closes title section */}

        {/* Day selection pill buttons to toggle focus on specific days */}
        <div className="flex items-center gap-1.5 flex-wrap"> {/* day filter pills container */}
          <button // All Days filter button
            type="button" // button element
            onClick={() => setSelectedDay(null)} // resets day filter to show all
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${ // button styling
              selectedDay === null // active condition check
                ? "bg-lake text-white shadow-xs" // active styling
                : "bg-sand text-ink-soft hover:text-ink hover:bg-sand/80 border border-line" // inactive styling
            }`} // closes class string
          > {/* button label */}
            All Days {/* button text */}
          </button> {/* closes All Days button */}

          {itinerary.days.map((day) => { // iterate through itinerary days
            const dayColor = DAY_COLORS[day.dayIndex % DAY_COLORS.length]; // day color string
            const isDaySelected = selectedDay === day.dayIndex; // check if this day is selected
            return ( // returns day pill button
              <button // day pill element
                key={`filter-day-${day.dayIndex}`} // unique react key
                type="button" // button element
                onClick={() => setSelectedDay(day.dayIndex)} // selects active day
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${ // pill styling
                  isDaySelected // active check
                    ? "bg-lake text-white shadow-xs" // active background
                    : "bg-sand text-ink-soft hover:text-ink hover:bg-sand/80 border border-line" // inactive background
                }`} // closes template string
              > {/* button contents */}
                <span // colored dot indicator
                  className="w-2 h-2 rounded-full shrink-0" // circular dot dimensions
                  style={{ backgroundColor: dayColor }} // custom day color dot
                /> {/* closes dot */}
                <span>Day {day.dayIndex + ONE_INCREMENT}</span> {/* day label */}
              </button> // closes day pill button
            ); // ends return
          })} {/* ends map */}
        </div> {/* closes filter pills container */}
      </div> {/* closes header wrapper */}

      {/* Map container with exact height rules: h-[60vh] on mobile and h-[420px] on desktop */}
      <div className="h-[60vh] lg:h-[420px] w-full rounded-2xl overflow-hidden border border-line relative shadow-sm"> {/* map frame */}
        <MapContainer // Leaflet map container component
          center={initialCenter} // initial center coordinates
          zoom={DEFAULT_MAP_ZOOM} // initial zoom level
          scrollWheelZoom={false} // disables disruptive wheel zooming on page scroll
          className="h-full w-full z-0" // fills parent container with base z-index
        > {/* map contents */}
          {/* Tile layer pointing to OpenStreetMap with attribution */}
          <TileLayer // tile layer component
            url={TILE_LAYER_URL} // tile image URL template
            maxZoom={TILE_LAYER_MAX_ZOOM} // zoom level ceiling
            attribution={TILE_LAYER_ATTRIBUTION} // attribution legal notice
          /> {/* closes TileLayer */}

          {/* FitBounds subcomponent to center view and animate smoothly */}
          <FitBounds itinerary={itinerary} selectedDay={selectedDay} /> {/* bounds manager */}

          {/* Polylines for each day: hotel -> visits in order -> hotel */}
          {itinerary.days.map((day) => { // iterate through days for polylines
            // Filter day items for visit stops
            const visits = day.items.filter((item): item is VisitItem => item.kind === "visit"); // array of visits
            // If day has no visits, skip rendering polyline loop
            if (visits.length === ZERO_INDEX) return null; // skips empty days

            // Assemble coordinates loop: hotel -> visits in order -> hotel
            const polylinePositions: [number, number][] = [ // coordinate array
              [itinerary.lodging.location.lat, itinerary.lodging.location.lon], // starting at hotel
              ...visits.map((visit): [number, number] => [visit.location.lat, visit.location.lon]), // visits in order
              [itinerary.lodging.location.lat, itinerary.lodging.location.lon], // returning to hotel
            ]; // closes polylinePositions

            // Determine day color and opacity based on selection state
            const dayColor = DAY_COLORS[day.dayIndex % DAY_COLORS.length]; // day color string
            const isSelected = selectedDay === null || selectedDay === day.dayIndex; // selection flag
            const opacity = isSelected ? OPACITY_SELECTED : OPACITY_UNSELECTED; // dynamic opacity

            return ( // returns Polyline component
              <Polyline // polyline path element
                key={`polyline-day-${day.dayIndex}`} // unique react key
                positions={polylinePositions} // route coordinates list
                pathOptions={{ // styling parameters
                  color: dayColor, // day theme color
                  weight: POLYLINE_WEIGHT_PX, // stroke width
                  opacity, // active or dimmed opacity
                }} // closes pathOptions
              > {/* polyline children */}
                <Tooltip sticky> {/* sticky tooltip on route hover */}
                  {ROUTE_TOOLTIP_TEXT} {/* tooltip message */}
                </Tooltip> {/* closes Tooltip */}
              </Polyline> // closes Polyline
            ); // ends return
          })} {/* ends polylines map */}

          {/* Hotel lodging marker with custom house icon */}
          <Marker // lodging marker component
            position={[itinerary.lodging.location.lat, itinerary.lodging.location.lon]} // hotel coordinates
            icon={HOTEL_DIV_ICON} // house icon DivIcon
            title={itinerary.lodging.name} // accessible title
            keyboard={true} // enables keyboard accessibility
          > {/* marker children */}
            <Popup> {/* accessible popup card */}
              <div className="p-1 space-y-1.5 min-w-[180px] font-sans"> {/* popup container */}
                <div className="font-semibold text-ink text-sm leading-tight"> {/* title */}
                  {itinerary.lodging.name} {/* hotel name */}
                </div> {/* closes title */}
                <div className="text-xs text-ink-soft"> {/* details */}
                  Lodging • {itinerary.lodging.nights} nights • {itinerary.lodging.rooms} room(s) {/* hotel room info */}
                </div> {/* closes details */}
                <div className="pt-0.5"> {/* badge container */}
                  <span // accessibility badge
                    className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${ // badge styling
                      itinerary.lodging.stepFree === "step_free" // step-free check
                        ? "bg-ok/10 text-ok border border-ok/30" // green style
                        : itinerary.lodging.stepFree === "partial" // partial check
                        ? "bg-warn/10 text-warn border border-warn/30" // amber style
                        : "bg-sand text-ink-soft border border-line" // neutral style
                    }`} // closes template string
                  > {/* badge text */}
                    {STEP_FREE_LABEL[itinerary.lodging.stepFree]} {/* step-free status */}
                  </span> {/* closes badge */}
                </div> {/* closes badge container */}
              </div> {/* closes popup container */}
            </Popup> {/* closes Popup */}
          </Marker> {/* closes Marker */}

          {/* Markers for every visit stop in every day */}
          {itinerary.days.map((day) => { // iterate through days
            // Filter day items for visit items
            const visits = day.items.filter((item): item is VisitItem => item.kind === "visit"); // visits array
            // Check if day is currently selected or if all days are visible
            const isDaySelected = selectedDay === null || selectedDay === day.dayIndex; // selection flag

            return visits.map((visit, visitIndex) => { // iterate through visits in order
              const stopOrder = visitIndex + ONE_INCREMENT; // 1-based stop sequence number
              const stopIcon = getStopIcon(stopOrder, day.dayIndex); // generates day-colored circular div icon
              const costFormatted = money(visit.cost.amountMinor, visit.cost.currency); // formatted money string
              const stepFreeText = STEP_FREE_LABEL[visit.stepFree]; // readable accessibility label

              return ( // returns visit Marker
                <Marker // marker element
                  key={`marker-day-${day.dayIndex}-visit-${visit.id}`} // unique react key
                  position={[visit.location.lat, visit.location.lon]} // visit coordinates
                  icon={stopIcon} // custom circular div icon
                  title={visit.name} // accessible title matching place name
                  keyboard={true} // enables keyboard accessibility
                  opacity={isDaySelected ? OPACITY_SELECTED : OPACITY_UNSELECTED} // dims unselected days
                > {/* marker children */}
                  <Popup> {/* popup on marker click */}
                    <div className="p-1 space-y-1.5 min-w-[180px] font-sans"> {/* popup container */}
                      <div className="font-semibold text-ink text-sm leading-tight"> {/* place name */}
                        {visit.name} {/* place title */}
                      </div> {/* closes place name */}
                      <div className="text-xs text-ink-soft"> {/* time range */}
                        Day {day.dayIndex + ONE_INCREMENT} • {visit.start} – {visit.end} {/* day and visit hours */}
                      </div> {/* closes time range */}
                      <div className="text-xs font-semibold text-ink"> {/* cost line */}
                        {costFormatted} {/* formatted party cost */}
                        {visit.cost.provenance === "estimate" && ( // check for estimate
                          <span className="text-[10px] text-ink-soft font-normal ml-1 italic">(Estimated)</span> // estimate badge
                        )} {/* closes estimate check */}
                      </div> {/* closes cost line */}
                      <div className="pt-0.5"> {/* status container */}
                        <span // accessibility badge
                          className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${ // badge styling
                            visit.stepFree === "step_free" // step-free condition
                              ? "bg-ok/10 text-ok border border-ok/30" // green ok styling
                              : visit.stepFree === "partial" // partial condition
                              ? "bg-warn/10 text-warn border border-warn/30" // amber warning styling
                              : visit.stepFree === "not_step_free" // not step-free condition
                              ? "bg-bad/10 text-bad border border-bad/30" // red bad styling
                              : "bg-sand text-ink-soft border border-line" // neutral styling
                          }`} // closes class string
                        > {/* badge content */}
                          {stepFreeText} {/* step-free description */}
                        </span> {/* closes badge */}
                      </div> {/* closes status container */}
                    </div> {/* closes popup container */}
                  </Popup> {/* closes Popup */}
                </Marker> // closes Marker
              ); // ends visit return
            }); // ends visits map
          })} {/* ends days map */}
        </MapContainer> {/* closes MapContainer */}
      </div> {/* closes map frame */}
    </div> // closes card container
  ); // ends return
} // ends MapView component

// Default export for React.lazy dynamic loading support
export default MapView; // enables default export for lazy loading
