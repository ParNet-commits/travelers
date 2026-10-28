// Import React hooks and types for form management and event subscriptions
import { useEffect, useState, type ChangeEvent, type FormEvent, type JSX } from "react"; // React hooks for state, effect, and event types
// Import TripRequest schema and types from shared travelverse contract
import { CURRENCIES, Pace, TripRequest, type CurrencyCode, type TripRequest as TripRequestType } from "../../types/travelverse.js"; // shared contract schemas and types
// Import useRun hook to trigger live agent planning and inspect run status
import { useRun } from "../state/RunProvider.js"; // global run context consumer

// Define interface for TripForm component properties
export interface TripFormProps { // props interface for TripForm
  // Optional preset trip to populate initial values or update form fields
  presetTrip?: TripRequestType | null; // incoming preset data to populate form
} // ends props interface

// Constant for maximum allowed characters in mood description textarea
const MAX_MOOD_CHARACTERS = 280; // limit matching TripRequest mood max length
// Constant multiplier to convert major currency units (dollars, euros) to minor units (cents, paise)
const CURRENCY_MINOR_MULTIPLIER = 100; // factor to convert major to minor currency units
// Constant minimum allowed traveler count
const MIN_TRAVELERS = 1; // lowest valid travelers count
// Constant maximum allowed traveler count
const MAX_TRAVELERS = 8; // highest valid travelers count
// Constant default currency code
const DEFAULT_CURRENCY: CurrencyCode = "USD"; // fallback currency
// Constant default traveler count string
const DEFAULT_TRAVELER_COUNT_STR = "2"; // fallback traveler count
// Constant default budget string
const DEFAULT_BUDGET_AMOUNT_STR = "900"; // fallback budget amount

// Intent: Render customizable travel request form with validation against Zod schema and inline errors
export function TripForm({ presetTrip }: TripFormProps): JSX.Element { // exports TripForm component
  // Extract agent start action and status from run context
  const { start, state } = useRun(); // retrieves active planning state and start function

  // State for origin / departure location
  const [origin, setOrigin] = useState<string>(""); // tracks departure city input value
  // State for destination location
  const [destination, setDestination] = useState<string>(""); // tracks destination city input value
  // State for trip start date (YYYY-MM-DD)
  const [startDate, setStartDate] = useState<string>(""); // tracks arrival / trip start date
  // State for trip end date (YYYY-MM-DD)
  const [endDate, setEndDate] = useState<string>(""); // tracks departure / trip end date
  // State for travelers count
  const [travelers, setTravelers] = useState<string>(DEFAULT_TRAVELER_COUNT_STR); // tracks number of travelers as string
  // State for budget amount in major units (e.g. 900 for $900)
  const [budgetAmount, setBudgetAmount] = useState<string>(DEFAULT_BUDGET_AMOUNT_STR); // tracks major unit budget value
  // State for selected currency code
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY); // tracks currency enum code
  // State for pace preference (relaxed, balanced, packed)
  const [pace, setPace] = useState<"relaxed" | "balanced" | "packed">("relaxed"); // tracks pace selection
  // State for emotional mood / trip vibes description
  const [mood, setMood] = useState<string>(""); // tracks freeform trip description
  // State for step-free accessibility requirement flag
  const [stepFreeRequired, setStepFreeRequired] = useState<boolean>(false); // tracks step-free mobility constraint
  // State for optional maximum walking distance per day in kilometers
  const [maxWalkKm, setMaxWalkKm] = useState<string>(""); // tracks walking limit or empty string for null
  // State for accessibility notes
  const [notes, setNotes] = useState<string>(""); // tracks additional accessibility notes
  // State dictionary holding field-specific validation error messages
  const [errors, setErrors] = useState<Record<string, string>>({}); // maps dot-separated path to error string

  // Helper function to populate all form fields from a TripRequest object
  const fillFromTrip = (trip: TripRequestType) => { // updates all internal state variables from a trip request
    // Set origin city
    setOrigin(trip.origin); // updates origin
    // Set destination city
    setDestination(trip.destination); // updates destination
    // Set ISO start date
    setStartDate(trip.startDate); // updates start date
    // Set ISO end date
    setEndDate(trip.endDate); // updates end date
    // Set travelers count as string
    setTravelers(String(trip.travelers)); // updates travelers
    // Convert budget amountMinor to major currency units
    const majorAmount = trip.budget.amountMinor / CURRENCY_MINOR_MULTIPLIER; // computes major unit value
    // Set budget amount as string
    setBudgetAmount(String(majorAmount)); // updates budget amount
    // Set currency enum
    setCurrency(trip.budget.currency); // updates currency
    // Set trip pace
    setPace(trip.pace); // updates pace
    // Set trip mood
    setMood(trip.mood); // updates mood
    // Set step-free requirement
    setStepFreeRequired(trip.accessibility.stepFreeRequired); // updates step-free flag
    // Set max walking distance or empty string
    setMaxWalkKm(trip.accessibility.maxWalkKmPerDay !== null ? String(trip.accessibility.maxWalkKmPerDay) : ""); // updates walking distance
    // Set accessibility notes
    setNotes(trip.accessibility.notes); // updates notes
    // Clear any previous validation errors
    setErrors({}); // resets error messages dictionary
  }; // ends fillFromTrip helper

  // Sync form whenever presetTrip prop changes
  useEffect(() => { // effect hook listening for prop updates
    // Populate form if presetTrip is defined
    if (presetTrip) { // checks if valid preset was provided
      fillFromTrip(presetTrip); // fills form fields
    } // ends check
  }, [presetTrip]); // re-runs when presetTrip prop changes

  // Listen for global custom event dispatched from PresetCard or external triggers
  useEffect(() => { // effect hook subscribing to custom browser event
    // Event listener callback function
    const onPresetEvent = (event: Event) => { // handles custom preset broadcast
      // Cast event to CustomEvent with TripRequest detail
      const customEv = event as CustomEvent<TripRequestType>; // casts custom event type
      // Populate fields if detail exists
      if (customEv.detail) { // checks for presence of trip details
        fillFromTrip(customEv.detail); // fills form fields
      } // ends check
    }; // ends callback
    // Attach listener to window
    const EVENT_NAME = "tv:preset"; // custom event name identifier
    window.addEventListener(EVENT_NAME, onPresetEvent); // subscribes to event
    // Cleanup listener on unmount
    return () => { // cleanup function
      window.removeEventListener(EVENT_NAME, onPresetEvent); // unsubscribes to prevent memory leaks
    }; // ends cleanup
  }, []); // mounts once

  // Handle form submission and validation
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => { // async submit event handler
    // Prevent default browser form submission
    event.preventDefault(); // stops page reload
    // Compute integer amount minor from input amount
    const parsedAmount = Number(budgetAmount); // parses string budget input to number
    const amountMinor = Math.round(parsedAmount * CURRENCY_MINOR_MULTIPLIER); // converts to integer minor units
    // Parse max walking distance to number or null
    const parsedWalk = maxWalkKm.trim() === "" ? null : Number(maxWalkKm); // converts to number or null

    // Construct raw trip request object for schema validation
    const candidateTrip = { // builds candidate payload
      origin: origin.trim(), // trims departure city whitespace
      destination: destination.trim(), // trims destination city whitespace
      startDate: startDate.trim(), // trims start date string
      endDate: endDate.trim(), // trims end date string
      travelers: Number(travelers), // parses traveler count to number
      budget: { // budget object
        amountMinor, // integer minor units
        currency, // selected currency code
      }, // closes budget
      pace, // selected pace enum
      mood: mood.trim(), // trimmed mood description
      accessibility: { // accessibility constraints object
        stepFreeRequired, // boolean flag
        maxWalkKmPerDay: parsedWalk, // number or null
        notes: notes.trim(), // trimmed notes
      }, // closes accessibility
    }; // closes candidateTrip

    // Validate candidate object against strict Zod TripRequest schema
    const validationResult = TripRequest.safeParse(candidateTrip); // performs runtime validation

    // Handle validation failure
    if (!validationResult.success) { // checks if validation failed
      // Dictionary to accumulate field errors
      const fieldErrors: Record<string, string> = {}; // empty errors map
      // Iterate through each validation issue
      for (const issue of validationResult.error.issues) { // loops through Zod issues
        // Join path elements with dot notation
        const pathKey = issue.path.join("."); // constructs field key e.g. 'budget.amountMinor'
        // Assign first error message encountered for this path
        if (!fieldErrors[pathKey]) { // checks if key is already recorded
          fieldErrors[pathKey] = issue.message; // records issue message
        } // ends assignment
      } // ends issue loop
      // Update errors state to show inline feedback
      setErrors(fieldErrors); // updates errors state
      return; // aborts submit
    } // ends failure handling

    // Clear any previous error messages on successful validation
    setErrors({}); // resets errors

    // Start live planning run with validated trip request
    await start({ // calls run provider start method
      trip: validationResult.data, // strictly validated TripRequest payload
      mode: "live", // sets live execution mode
      presetId: null, // custom user input, no presetId
      routeOverride: null, // default model routing
    }); // ends start invocation
  }; // ends handleSubmit

  // Check if planning run is currently active to disable form inputs and submit button
  const isBusy = state.status === "connecting" || state.status === "streaming"; // boolean busy indicator

  // Render trip request form
  return ( // returns form JSX
    <form // form element wrapper
      onSubmit={handleSubmit} // binds submit handler
      noValidate // disables browser default validation popups in favor of custom inline errors
      className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-5" // card styling
    > {/* form contents */}
      {/* Form header and description */}
      <div className="border-b border-line pb-4"> {/* header container */}
        <h3 className="text-lg font-semibold text-ink font-display"> {/* title */}
          Trip Details {/* form heading */}
        </h3> {/* closes heading */}
        <p className="text-xs text-ink-soft mt-1"> {/* description */}
          Tell us about your journey and family needs. We'll plan and check every detail. {/* helper text */}
        </p> {/* closes description */}
      </div> {/* closes header container */}

      {/* Row for Origin and Destination inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> {/* responsive 2-column grid */}
        {/* Origin field */}
        <div> {/* container */}
          <label htmlFor="trip-origin" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            From {/* label text */}
          </label> {/* closes label */}
          <input // text input
            id="trip-origin" // unique id for label pairing
            type="text" // text input type
            value={origin} // controlled value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setOrigin(e.target.value)} // change handler
            placeholder="e.g. Mumbai" // placeholder text
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["origin"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["origin"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes origin container */}

        {/* Destination field */}
        <div> {/* container */}
          <label htmlFor="trip-destination" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            To {/* label text */}
          </label> {/* closes label */}
          <input // text input
            id="trip-destination" // unique id for label pairing
            type="text" // text input type
            value={destination} // controlled value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setDestination(e.target.value)} // change handler
            placeholder="e.g. Udaipur" // placeholder text
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["destination"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["destination"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes destination container */}
      </div> {/* closes origin/destination grid */}

      {/* Row for Start Date and End Date inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> {/* responsive 2-column grid */}
        {/* Start Date field */}
        <div> {/* container */}
          <label htmlFor="trip-start-date" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Start date {/* label text */}
          </label> {/* closes label */}
          <input // date input
            id="trip-start-date" // unique id for label pairing
            type="date" // native date picker
            value={startDate} // controlled ISO string value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)} // change handler
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["startDate"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["startDate"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes start date container */}

        {/* End Date field */}
        <div> {/* container */}
          <label htmlFor="trip-end-date" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            End date {/* label text */}
          </label> {/* closes label */}
          <input // date input
            id="trip-end-date" // unique id for label pairing
            type="date" // native date picker
            value={endDate} // controlled ISO string value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)} // change handler
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["endDate"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["endDate"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes end date container */}
      </div> {/* closes dates grid */}

      {/* Row for Travelers and Budget */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"> {/* 3-column responsive grid */}
        {/* Travelers count */}
        <div> {/* container */}
          <label htmlFor="trip-travelers" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Travellers (1–8) {/* label text */}
          </label> {/* closes label */}
          <input // number input
            id="trip-travelers" // unique id
            type="number" // numeric input
            min={MIN_TRAVELERS} // lower bound constraint
            max={MAX_TRAVELERS} // upper bound constraint
            value={travelers} // controlled value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTravelers(e.target.value)} // change handler
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["travelers"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["travelers"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes travelers container */}

        {/* Budget Amount */}
        <div> {/* container */}
          <label htmlFor="trip-budget-amount" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Budget amount {/* label text */}
          </label> {/* closes label */}
          <input // number input
            id="trip-budget-amount" // unique id
            type="number" // numeric input
            min="1" // minimum positive amount
            step="1" // whole major units
            value={budgetAmount} // controlled value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetAmount(e.target.value)} // change handler
            placeholder="e.g. 900" // placeholder text
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {(errors["budget.amountMinor"] || errors["budget"]) && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["budget.amountMinor"] || errors["budget"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes budget amount container */}

        {/* Currency selection */}
        <div> {/* container */}
          <label htmlFor="trip-currency" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Currency {/* label text */}
          </label> {/* closes label */}
          <select // select dropdown
            id="trip-currency" // unique id
            value={currency} // controlled currency code
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setCurrency(e.target.value as CurrencyCode)} // change handler
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors cursor-pointer" // select styling
          > {/* options list */}
            {CURRENCIES.map((c) => ( // iterate over supported currency codes
              <option key={c} value={c}>{c}</option> // option element
            ))} {/* ends mapping */}
          </select> {/* closes select */}
          {errors["budget.currency"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["budget.currency"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes currency container */}
      </div> {/* closes travelers and budget grid */}

      {/* Pace segmented control */}
      <div> {/* container */}
        <label className="block text-xs font-medium text-ink mb-1.5"> {/* section label */}
          Trip Pace {/* label text */}
        </label> {/* closes label */}
        <div // segmented control bar container
          role="radiogroup" // accessibility radio group role
          aria-label="Trip pace" // group accessibility label
          className="grid grid-cols-3 gap-1 p-1 bg-sand border border-line rounded-xl" // segmented bar styling
        > {/* segments list */}
          {Pace.options.map((option) => { // iterate over pace options directly from Pace schema
            const isSelected = pace === option; // checks active selection
            return ( // returns segment button
              <button // segment button element
                key={option} // React key
                type="button" // button type
                role="radio" // accessibility radio role
                aria-checked={isSelected} // checked attribute
                disabled={isBusy} // disabled state
                onClick={() => setPace(option)} // selection handler
                className={`min-h-11 py-2 px-3 text-xs font-medium rounded-lg capitalize transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake ${ // dynamic segment styling
                  isSelected // selected check
                    ? "bg-card text-ink font-semibold shadow-sm border border-line/60" // active segment style
                    : "text-ink-soft hover:text-ink hover:bg-card/50" // inactive segment style
                }`} // closes styling template literal
              > {/* button label */}
                {option} {/* pace name */}
              </button> // closes segment button
            ); // ends return
          })} {/* ends map */}
        </div> {/* closes segmented control */}
        {errors["pace"] && ( // conditional inline error
          <p className="mt-1 text-xs text-bad" role="alert">{errors["pace"]}</p> // error message
        )} {/* ends error */}
      </div> {/* closes pace container */}

      {/* Mood textarea with live character counter */}
      <div> {/* container */}
        <div className="flex items-center justify-between mb-1.5"> {/* label and counter header flex */}
          <label htmlFor="trip-mood" className="block text-xs font-medium text-ink"> {/* field label */}
            Trip Mood & Story {/* label text */}
          </label> {/* closes label */}
          <span className={`text-xs ${mood.length > MAX_MOOD_CHARACTERS ? "text-bad font-semibold" : "text-ink-soft"}`}> {/* character counter element */}
            {mood.length} / {MAX_MOOD_CHARACTERS} {/* live character count display */}
          </span> {/* closes character counter */}
        </div> {/* closes counter flex */}
        <textarea // textarea element
          id="trip-mood" // unique id
          rows={3} // rows attribute
          maxLength={MAX_MOOD_CHARACTERS} // max character length
          value={mood} // controlled value
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMood(e.target.value)} // change handler
          placeholder="e.g. My parents' 30th wedding anniversary. Romantic, calm, lakeside, a little royal." // placeholder
          disabled={isBusy} // disabled state
          className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors resize-none" // textarea styling
        /> {/* closes textarea */}
        {errors["mood"] && ( // conditional inline error
          <p className="mt-1 text-xs text-bad" role="alert">{errors["mood"]}</p> // error message
        )} {/* ends error */}
      </div> {/* closes mood container */}

      {/* Accessibility Constraints Section */}
      <div className="pt-2 border-t border-line space-y-4"> {/* accessibility container */}
        <div className="flex items-center justify-between"> {/* title and switch flex container */}
          <div> {/* label info group */}
            <label htmlFor="step-free-toggle" className="text-sm font-medium text-ink cursor-pointer"> {/* switch label */}
              Step-free required {/* label text */}
            </label> {/* closes label */}
            <p className="text-xs text-ink-soft"> {/* description */}
              Enforces ramps, elevators, and verified flat access for all venues. {/* explanation */}
            </p> {/* closes description */}
          </div> {/* closes info group */}

          {/* Accessible toggle switch */}
          <button // switch button element
            id="step-free-toggle" // unique id for label pairing
            type="button" // button type
            role="switch" // switch accessibility role
            aria-checked={stepFreeRequired} // checked state
            disabled={isBusy} // disabled state
            onClick={() => setStepFreeRequired((prev) => !prev)} // toggle handler
            className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer ${ // switch container styling
              stepFreeRequired ? "bg-lake" : "bg-line" // dynamic background color
            }`} // closes switch container class
          > {/* switch toggle knob */}
            <span // sliding knob element
              className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${ // knob styling
                stepFreeRequired ? "translate-x-5" : "translate-x-0" // translation offset
              }`} // closes knob class
            /> {/* closes knob */}
          </button> {/* closes switch */}
        </div> {/* closes switch row */}
        {errors["accessibility.stepFreeRequired"] && ( // conditional inline error
          <p className="text-xs text-bad" role="alert">{errors["accessibility.stepFreeRequired"]}</p> // error message
        )} {/* ends error */}

        {/* Optional Max walking km per day */}
        <div> {/* container */}
          <label htmlFor="trip-max-walk" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Max walking km per day (optional) {/* label text */}
          </label> {/* closes label */}
          <input // number input
            id="trip-max-walk" // unique id
            type="number" // numeric input
            step="0.5" // fractional half-kilometer steps
            min="0.5" // minimum distance
            max="30" // maximum distance
            value={maxWalkKm} // controlled string value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxWalkKm(e.target.value)} // change handler
            placeholder="e.g. 2.0" // placeholder text
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["accessibility.maxWalkKmPerDay"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["accessibility.maxWalkKmPerDay"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes max walking container */}

        {/* Accessibility Notes */}
        <div> {/* container */}
          <label htmlFor="trip-notes" className="block text-xs font-medium text-ink mb-1.5"> {/* field label */}
            Accessibility Notes {/* label text */}
          </label> {/* closes label */}
          <input // text input
            id="trip-notes" // unique id
            type="text" // text input
            maxLength={200} // max length 200 chars
            value={notes} // controlled value
            onChange={(e: ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)} // change handler
            placeholder="e.g. Father cannot climb stairs; short walks only." // placeholder text
            disabled={isBusy} // disabled state
            className="w-full px-3.5 py-2.5 rounded-xl border border-line bg-sand/40 text-sm text-ink placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake transition-colors" // input styling
          /> {/* closes input */}
          {errors["accessibility.notes"] && ( // conditional inline error
            <p className="mt-1 text-xs text-bad" role="alert">{errors["accessibility.notes"]}</p> // error message
          )} {/* ends error */}
        </div> {/* closes accessibility notes container */}
      </div> {/* closes accessibility section */}

      {/* Submit button container */}
      <div className="pt-3"> {/* button container */}
        <button // submit button element
          type="submit" // form submit trigger
          disabled={isBusy} // disabled while agent is streaming or connecting
          className="w-full min-h-11 inline-flex items-center justify-center px-4 py-3 rounded-xl font-medium text-sm text-white bg-lake hover:bg-lake/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake cursor-pointer" // button styling
        > {/* button contents */}
          {isBusy ? ( // conditional label based on active status
            <span className="flex items-center space-x-2"> {/* spinner and label flex */}
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" /> {/* loading spinner */}
              <span>Planning trip with agent...</span> {/* busy text */}
            </span> // closes flex
          ) : ( // idle label
            <span>Plan My Trip</span> // default button label
          )} {/* ends conditional */}
        </button> {/* closes button */}
      </div> {/* closes button container */}
    </form> // closes form
  ); // ends return
} // ends TripForm component
