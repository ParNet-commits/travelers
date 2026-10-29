// Import React core hooks and type definitions
import { useCallback, useEffect, useId, useState, type ChangeEvent, type FormEvent, type JSX } from "react"; // React hooks for component state and lifecycle
// Import Zod schema and TypeScript type for HealthResponse
import { HealthResponse } from "../../types/travelverse.js"; // shared schema for health endpoint payload
// Import admin settings utilities for token and route overrides
import { clearRouteOverride, getAdminToken, getRouteOverride, setAdminToken, setRouteOverride, type RouteOverride } from "../lib/adminSettings.js"; // storage helpers
// Import shortModelName helper to display human-readable model labels
import { shortModelName } from "../lib/format.js"; // display formatter for model names

// Define named constant for polling interval in milliseconds
const HEALTH_POLL_INTERVAL_MS = 30000; // poll every 30 seconds while tab is visible
// Define named constant for HTTP 401 Unauthorized status code
const HTTP_STATUS_UNAUTHORIZED = 401; // unauthorized status code
// Define named constant for USD currency decimal precision
const USD_DECIMAL_PLACES = 4; // four decimal places for fine spend tracking
// Define named constant for limits USD decimal precision
const LIMIT_USD_DECIMAL_PLACES = 2; // two decimal places for limit thresholds
// Define named constant for milliseconds per second conversion factor
const MS_PER_SECOND = 1000; // millisecond to second factor
// Define named constant for seconds decimal precision
const SECONDS_DECIMAL_PLACES = 1; // one decimal place for durations in seconds
// Define named constant for empty collection count
const EMPTY_COLLECTION_LENGTH = 0; // zero elements threshold

// Intent: Render administrative Control Room dashboard to monitor system health, inspect models, and configure routing overrides
export function ControlRoom(): JSX.Element { // exports ControlRoom component
  // Unique accessible IDs for form fields
  const tokenInputId = useId(); // id for admin token input
  const fastSelectId = useId(); // id for fast model select
  const plannerSelectId = useId(); // id for planner model select
  const escalationSelectId = useId(); // id for escalation model select

  // State holding parsed HealthResponse payload or null if not yet loaded
  const [health, setHealth] = useState<HealthResponse | null>(null); // stores server health data
  // State tracking initial or periodic background loading status
  const [isLoading, setIsLoading] = useState<boolean>(true); // loading indicator
  // State holding general error message if fetching or validation fails
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // error string or null

  // State holding admin token entered by user in the token input field
  const [adminTokenInput, setAdminTokenInput] = useState<string>(() => { // initializes token state
    return getAdminToken() ?? ""; // reads cached token from session storage or empty string
  }); // ends token state initialization

  // State tracking in-flight status of deep check query
  const [isDeepLoading, setIsDeepLoading] = useState<boolean>(false); // deep check spinner
  // State holding deep check error message (e.g. 401 Admin token rejected)
  const [deepError, setDeepError] = useState<string | null>(null); // deep check error string

  // State tracking active route override selections
  const [selectedRoutes, setSelectedRoutes] = useState<RouteOverride>(() => { // initializes route selections
    return getRouteOverride() ?? {}; // reads stored override from local storage or empty
  }); // ends route selections initialization

  // State holding confirmation message when route override is saved or cleared
  const [routeNotice, setRouteNotice] = useState<string | null>(null); // feedback message

  // Intent: Fetch health data from server API with optional deep diagnostics flag
  const fetchHealthData = useCallback(async (isDeepCheck = false): Promise<void> => { // defines fetch handler
    // Set loading indicator depending on whether this is a deep check or background poll
    if (isDeepCheck) { // checks if deep diagnostics requested
      setIsDeepLoading(true); // activates deep check loading
      setDeepError(null); // clears prior deep errors
    } else if (!health) { // checks if initial load
      setIsLoading(true); // activates initial loading state
    } // ends check

    // Construct target URL string with query parameter if deep check requested
    const targetUrl = isDeepCheck ? "/api/health?deep=1" : "/api/health"; // endpoint path
    // Prepare request headers record
    const requestHeaders: Record<string, string> = { // HTTP headers object
      accept: "application/json", // expects JSON response
    }; // ends headers

    // Attach x-tv-admin header if running deep check or if admin token is known
    const activeToken = adminTokenInput.trim() || (getAdminToken() ?? ""); // determines active token string
    if (activeToken) { // verifies token presence
      requestHeaders["x-tv-admin"] = activeToken; // passes admin header
    } // ends check

    // Execute network request wrapped in try/catch block
    try { // begins safety block
      // Perform HTTP GET request to health endpoint
      const response = await fetch(targetUrl, { // sends fetch request
        method: "GET", // HTTP GET method
        headers: requestHeaders, // attaches headers
      }); // ends fetch

      // Check for 401 Unauthorized response from server
      if (response.status === HTTP_STATUS_UNAUTHORIZED) { // checks 401 status
        setDeepError("Admin token rejected"); // set explicit 401 error text
        setIsDeepLoading(false); // clears deep loading state
        setIsLoading(false); // clears initial loading state
        return; // terminates execution
      } // ends 401 check

      // Check for any non-OK HTTP status code
      if (!response.ok) { // verifies successful response status
        const errorText = `Server returned status ${response.status}`; // constructs status error
        if (isDeepCheck) { // checks if deep check triggered error
          setDeepError(errorText); // sets deep check error
        } else { // general poll error
          setErrorMessage(errorText); // sets general error
        } // ends conditional
        setIsDeepLoading(false); // clears deep loading
        setIsLoading(false); // clears initial loading
        return; // terminates execution
      } // ends non-ok check

      // Parse JSON response body from response stream
      const rawData: unknown = await response.json(); // reads JSON
      // Validate response shape against HealthResponse Zod schema
      const parseResult = HealthResponse.safeParse(rawData); // executes validation
      // Verify validation succeeded
      if (!parseResult.success) { // checks validation result
        const validationErrorMessage = "Invalid health data schema received from server"; // readable error
        if (isDeepCheck) { // checks if deep check
          setDeepError(validationErrorMessage); // sets deep error
        } else { // general error
          setErrorMessage(validationErrorMessage); // sets general error
        } // ends conditional
        setIsDeepLoading(false); // clears deep loading
        setIsLoading(false); // clears initial loading
        return; // terminates execution
      } // ends schema failure check

      // Update health state with validated payload
      setHealth(parseResult.data); // sets health state
      setErrorMessage(null); // clears general errors
      // If deep check succeeded with active token, persist token to session storage
      if (isDeepCheck && activeToken) { // verifies deep success
        setAdminToken(activeToken); // saves verified token
      } // ends check
    } catch { // catches network or parsing exceptions
      const networkErrorMessage = "Could not reach server health endpoint"; // network error string
      if (isDeepCheck) { // checks if deep check
        setDeepError(networkErrorMessage); // sets deep error
      } else { // general error
        setErrorMessage(networkErrorMessage); // sets general error
      } // ends conditional
    } finally { // always executes cleanup
      setIsDeepLoading(false); // clears deep loading
      setIsLoading(false); // clears initial loading
    } // ends try/catch/finally
  }, [adminTokenInput, health]); // dependencies for useCallback

  // Intent: Initial fetch on mount and automatic polling every 30 seconds while browser tab is visible
  useEffect(() => { // lifecycle hook for polling
    // Fetch initial health data immediately on mount
    void fetchHealthData(false); // initial fetch

    // Setup interval timer to poll health endpoint
    const timerId = setInterval(() => { // sets recurring timer
      // Only poll when the document tab is currently visible to save bandwidth
      if (typeof document !== "undefined" && !document.hidden) { // visibility check
        void fetchHealthData(false); // background poll
      } // ends visibility check
    }, HEALTH_POLL_INTERVAL_MS); // interval period

    // Event listener handler when user switches back to this browser tab
    const handleVisibilityChange = () => { // visibility callback
      // When tab becomes active and visible, trigger immediate refresh
      if (typeof document !== "undefined" && !document.hidden) { // checks if visible
        void fetchHealthData(false); // immediate tab-switch refresh
      } // ends check
    }; // ends handleVisibilityChange

    // Attach event listener for tab visibility changes
    document.addEventListener("visibilitychange", handleVisibilityChange); // registers listener

    // Cleanup interval and event listener on unmount
    return () => { // cleanup function
      clearInterval(timerId); // cancels interval
      document.removeEventListener("visibilitychange", handleVisibilityChange); // unregisters listener
    }; // ends cleanup
  }, [fetchHealthData]); // re-runs if fetchHealthData identity changes

  // Intent: Handle admin token input change
  const handleTokenInputChange = (event: ChangeEvent<HTMLInputElement>) => { // input change handler
    const nextToken = event.target.value; // extracts text value
    setAdminTokenInput(nextToken); // updates input state
    setAdminToken(nextToken); // syncs to session storage
  }; // ends handleTokenInputChange

  // Intent: Trigger deep diagnostics check on form submission
  const handleDeepCheckSubmit = async (event: FormEvent) => { // form submit handler
    event.preventDefault(); // prevents browser default form submission
    await fetchHealthData(true); // runs deep check
  }; // ends handleDeepCheckSubmit

  // Intent: Handle route override selection change for a given model role
  const handleRouteSelectChange = (role: "fast" | "planner" | "escalation", value: string) => { // change handler
    setSelectedRoutes((previous) => ({ // updates route state
      ...previous, // preserves other roles
      [role]: value, // updates targeted role
    })); // ends state update
    setRouteNotice(null); // clears prior save notice
  }; // ends handleRouteSelectChange

  // Intent: Save model route override to local storage
  const handleSaveRouteOverride = () => { // save button click handler
    // Ensure all three roles are populated or preserve existing models from health
    const fast = selectedRoutes.fast || health?.models.fast; // fast model
    const planner = selectedRoutes.planner || health?.models.planner; // planner model
    const escalation = selectedRoutes.escalation || health?.models.escalation; // escalation model
    // Build override object
    const overrideToSave: RouteOverride = { fast, planner, escalation }; // constructs override
    setRouteOverride(overrideToSave); // writes to localStorage
    setRouteNotice("Model override saved to this browser! Remember to provide the Admin token so the server accepts it."); // feedback
  }; // ends handleSaveRouteOverride

  // Intent: Reset model route override back to server defaults
  const handleResetRouteOverride = () => { // reset button click handler
    clearRouteOverride(); // removes from localStorage
    setSelectedRoutes({}); // resets local state
    setRouteNotice("Model override cleared. Reverting to server default routing."); // feedback
  }; // ends handleResetRouteOverride

  // Render initial loading state
  if (isLoading && !health) { // checks if waiting for initial response
    return ( // returns loading placeholder
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10"> {/* container */}
        <div className="bg-card border border-line rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center space-y-3"> {/* card */}
          <div className="w-8 h-8 rounded-full border-2 border-lake border-t-transparent animate-spin" /> {/* spinner */}
          <p className="text-sm font-medium text-ink-soft">Loading Control Room diagnostics...</p> {/* status text */}
        </div> {/* closes card */}
      </div> // closes container
    ); // ends loading return
  } // ends loading check

  // Render error screen if initial fetch failed
  if (errorMessage && !health) { // checks if initial fetch failed
    return ( // returns error screen
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10"> {/* container */}
        <div className="bg-card border border-warn/30 rounded-2xl p-8 shadow-sm space-y-4 text-center"> {/* card */}
          <span className="inline-flex items-center text-xs font-semibold tracking-wider uppercase text-warn">System Error</span> {/* badge */}
          <h2 className="text-xl font-semibold text-ink font-display">Control Room Unavailable</h2> {/* heading */}
          <p className="text-sm text-ink-soft max-w-md mx-auto">{errorMessage}</p> {/* message */}
          <div className="pt-2"> {/* action */}
            <button // retry button
              type="button" // button type
              onClick={() => void fetchHealthData(false)} // retries fetch
              className="min-h-11 px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-lake hover:bg-lake/90 shadow-sm" // button style
            > {/* button label */}
              Retry Connection {/* text */}
            </button> {/* closes button */}
          </div> {/* closes action */}
        </div> {/* closes card */}
      </div> // closes container
    ); // ends error return
  } // ends error check

  // Guard against missing health data (should not happen after previous checks)
  if (!health) return <div />; // fallback empty

  // Resolve active displayed model values for selects (override if set, else health default)
  const currentFast = selectedRoutes.fast || health.models.fast; // fast model
  const currentPlanner = selectedRoutes.planner || health.models.planner; // planner model
  const currentEscalation = selectedRoutes.escalation || health.models.escalation; // escalation model

  // Render comprehensive Control Room interface
  return ( // returns dashboard JSX
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8"> {/* main container */}
      {/* Top navigation row and title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-5"> {/* header row */}
        <div> {/* title group */}
          <div className="flex items-center gap-3"> {/* heading and version badge */}
            <h1 className="text-2xl sm:text-3xl font-semibold text-ink font-display tracking-tight"> {/* title */}
              Control Room {/* title text */}
            </h1> {/* closes title */}
            <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-sand border border-line text-ink-soft"> {/* version badge */}
              v{health.version} {/* version text */}
            </span> {/* closes badge */}
          </div> {/* closes heading group */}
          <p className="text-xs sm:text-sm text-ink-soft mt-1"> {/* subtitle */}
            System health, live model routing, telemetry spend, and provider connectivity. {/* subtitle text */}
          </p> {/* closes subtitle */}
        </div> {/* closes title group */}
        <div> {/* back link action */}
          <a // back to planner link
            href="/" // link target
            className="min-h-11 inline-flex items-center px-4 py-2 text-xs sm:text-sm font-medium text-ink bg-card hover:bg-sand border border-line rounded-xl shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // button styling
          > {/* link content */}
            ← Back to Planner {/* link text */}
          </a> {/* closes link */}
        </div> {/* closes action */}
      </div> {/* closes header row */}

      {/* Section a: Status */}
      <section aria-labelledby="section-status-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-5"> {/* section container */}
        <div className="flex items-center justify-between border-b border-line pb-3"> {/* section header */}
          <h2 id="section-status-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            a) System Status {/* heading text */}
          </h2> {/* closes title */}
          {/* Live planning indicator badge */}
          <div className="flex items-center gap-2"> {/* live pill wrapper */}
            <span className="text-xs font-medium text-ink-soft">Live Planning:</span> {/* label */}
            <span // pill element
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${ // dynamic styling
                health.liveEnabled // checks live state
                  ? "bg-lake-soft text-lake border-lake/30" // enabled style
                  : "bg-marigold-soft text-warn border-marigold/30" // disabled style
              }`} // ends styling
            > {/* pill body */}
              <span className={`w-2 h-2 rounded-full ${health.liveEnabled ? "bg-lake animate-pulse" : "bg-warn"}`} aria-hidden="true" /> {/* dot */}
              <span>{health.liveEnabled ? "ON" : "OFF"}</span> {/* text status */}
            </span> {/* closes pill */}
          </div> {/* closes live pill wrapper */}
        </div> {/* closes section header */}

        {/* Grid of configured API keys and environment variables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"> {/* responsive grid */}
          {/* Nebius API Key status card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 flex items-center justify-between"> {/* card */}
            <div> {/* label group */}
              <div className="text-xs text-ink-soft font-medium">Nebius Token Factory</div> {/* provider */}
              <div className="text-sm font-semibold text-ink mt-0.5">Nebius Key</div> {/* key name */}
            </div> {/* closes label group */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${health.keys.nebius ? "text-ok bg-ok/10" : "text-warn bg-warn/10"}`}> {/* badge */}
              <span aria-hidden="true">{health.keys.nebius ? "✓" : "✗"}</span> {/* icon */}
              <span>{health.keys.nebius ? "Configured" : "Missing"}</span> {/* status text */}
            </span> {/* closes badge */}
          </div> {/* closes card */}

          {/* Tavily API Key status card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 flex items-center justify-between"> {/* card */}
            <div> {/* label group */}
              <div className="text-xs text-ink-soft font-medium">Tavily Web Search</div> {/* provider */}
              <div className="text-sm font-semibold text-ink mt-0.5">Tavily Key</div> {/* key name */}
            </div> {/* closes label group */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${health.keys.tavily ? "text-ok bg-ok/10" : "text-warn bg-warn/10"}`}> {/* badge */}
              <span aria-hidden="true">{health.keys.tavily ? "✓" : "✗"}</span> {/* icon */}
              <span>{health.keys.tavily ? "Configured" : "Missing"}</span> {/* status text */}
            </span> {/* closes badge */}
          </div> {/* closes card */}

          {/* Admin Token status card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 flex items-center justify-between"> {/* card */}
            <div> {/* label group */}
              <div className="text-xs text-ink-soft font-medium">Control Room Auth</div> {/* provider */}
              <div className="text-sm font-semibold text-ink mt-0.5">Admin Token</div> {/* key name */}
            </div> {/* closes label group */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${health.keys.admin ? "text-ok bg-ok/10" : "text-warn bg-warn/10"}`}> {/* badge */}
              <span aria-hidden="true">{health.keys.admin ? "✓" : "✗"}</span> {/* icon */}
              <span>{health.keys.admin ? "Configured" : "Missing"}</span> {/* status text */}
            </span> {/* closes badge */}
          </div> {/* closes card */}

          {/* Contact Email status card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 flex items-center justify-between"> {/* card */}
            <div> {/* label group */}
              <div className="text-xs text-ink-soft font-medium">OSM / Rate Limit ID</div> {/* provider */}
              <div className="text-sm font-semibold text-ink mt-0.5">Contact Email</div> {/* key name */}
            </div> {/* closes label group */}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${health.keys.contactEmail ? "text-ok bg-ok/10" : "text-warn bg-warn/10"}`}> {/* badge */}
              <span aria-hidden="true">{health.keys.contactEmail ? "✓" : "✗"}</span> {/* icon */}
              <span>{health.keys.contactEmail ? "Configured" : "Missing"}</span> {/* status text */}
            </span> {/* closes badge */}
          </div> {/* closes card */}
        </div> {/* closes keys grid */}
      </section> {/* closes section a */}

      {/* Section b: Models */}
      <section aria-labelledby="section-models-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-5"> {/* section container */}
        <div className="border-b border-line pb-3"> {/* header */}
          <h2 id="section-models-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            b) Models & Routing Matrix {/* heading text */}
          </h2> {/* closes title */}
          <p className="text-xs text-ink-soft mt-1">Active role models and the server allowlist of permitted LLMs.</p> {/* description */}
        </div> {/* closes header */}

        {/* Active roles cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> {/* three-column grid */}
          {/* Fast model role card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs uppercase tracking-wider font-semibold text-ink-soft">Fast Role</div> {/* role label */}
            <div className="text-base font-semibold text-ink">{shortModelName(health.models.fast)}</div> {/* human name */}
            <div className="text-[11px] font-mono text-ink-soft break-all">{health.models.fast}</div> {/* model identifier */}
          </div> {/* closes fast card */}

          {/* Planner model role card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs uppercase tracking-wider font-semibold text-ink-soft">Planner Role</div> {/* role label */}
            <div className="text-base font-semibold text-ink">{shortModelName(health.models.planner)}</div> {/* human name */}
            <div className="text-[11px] font-mono text-ink-soft break-all">{health.models.planner}</div> {/* model identifier */}
          </div> {/* closes planner card */}

          {/* Escalation model role card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs uppercase tracking-wider font-semibold text-ink-soft">Escalation Role</div> {/* role label */}
            <div className="text-base font-semibold text-ink">{shortModelName(health.models.escalation)}</div> {/* human name */}
            <div className="text-[11px] font-mono text-ink-soft break-all">{health.models.escalation}</div> {/* model identifier */}
          </div> {/* closes escalation card */}
        </div> {/* closes active roles cards */}

        {/* Server Allowlist chips */}
        <div className="space-y-2 pt-2"> {/* allowlist group */}
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Server Model Allowlist</span> {/* title */}
          <div className="flex flex-wrap gap-2"> {/* chips wrap */}
            {health.allowlist.map((modelId) => ( // maps allowlist ids
              <div key={modelId} className="bg-card border border-line rounded-lg px-2.5 py-1 text-xs font-mono text-ink flex items-center gap-1.5 shadow-sm"> {/* chip */}
                <span className="w-1.5 h-1.5 rounded-full bg-lake" aria-hidden="true" /> {/* dot */}
                <span>{modelId}</span> {/* id */}
                <span className="text-[10px] text-ink-soft font-sans">({shortModelName(modelId)})</span> {/* name */}
              </div> // closes chip
            ))} {/* ends allowlist map */}
          </div> {/* closes chips wrap */}
        </div> {/* closes allowlist group */}
      </section> {/* closes section b */}

      {/* Section c: Limits */}
      <section aria-labelledby="section-limits-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-4"> {/* section container */}
        <div className="border-b border-line pb-3"> {/* header */}
          <h2 id="section-limits-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            c) Safety Limits & Quotas {/* heading text */}
          </h2> {/* closes title */}
          <p className="text-xs text-ink-soft mt-1">Deterministic budget and resource caps enforced per run and per IP.</p> {/* description */}
        </div> {/* closes header */}

        {/* Four limits cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4"> {/* four-column grid */}
          <div className="bg-sand/60 border border-line rounded-xl p-4"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Max USD / Run</div> {/* title */}
            <div className="text-xl font-semibold text-ink mt-1">${health.limits.maxUsdPerRun.toFixed(LIMIT_USD_DECIMAL_PLACES)}</div> {/* value */}
          </div> {/* closes card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Runs / IP / Hour</div> {/* title */}
            <div className="text-xl font-semibold text-ink mt-1">{health.limits.runsPerIpPerHour}</div> {/* value */}
          </div> {/* closes card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Max Re-plans</div> {/* title */}
            <div className="text-xl font-semibold text-ink mt-1">{health.limits.maxReplans}</div> {/* value */}
          </div> {/* closes card */}
          <div className="bg-sand/60 border border-line rounded-xl p-4"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Deadline (s)</div> {/* title */}
            <div className="text-xl font-semibold text-ink mt-1">{Math.round(health.limits.deadlineMs / MS_PER_SECOND)} s</div> {/* value */}
          </div> {/* closes card */}
        </div> {/* closes limits grid */}
      </section> {/* closes section c */}

      {/* Section d: This instance */}
      <section aria-labelledby="section-instance-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-6"> {/* section container */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between border-b border-line pb-3 gap-1"> {/* header */}
          <h2 id="section-instance-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            d) This Instance Telemetry {/* heading text */}
          </h2> {/* closes title */}
          <span className="text-xs text-ink-soft italic"> {/* caption */}
            Serverless instances are short-lived; these numbers are per instance. {/* required caption text */}
          </span> {/* closes caption */}
        </div> {/* closes header */}

        {/* Telemetry summary counters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"> {/* three-column grid */}
          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Runs Handled</div> {/* title */}
            <div className="text-2xl font-semibold text-ink">{health.instance.runs}</div> {/* total runs */}
            <div className="text-xs text-ink-soft">
              {health.instance.liveRuns} live / {health.instance.replayRuns} replay {/* breakdown */}
            </div> {/* closes breakdown */}
          </div> {/* closes card */}

          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Estimated AI Spend</div> {/* title */}
            <div className="text-2xl font-semibold text-ink">${health.instance.estUsd.toFixed(USD_DECIMAL_PLACES)}</div> {/* spend */}
            <div className="text-xs text-ink-soft">Calculated from input + output tokens</div> {/* note */}
          </div> {/* closes card */}

          <div className="bg-sand/60 border border-line rounded-xl p-4 space-y-1"> {/* card */}
            <div className="text-xs text-ink-soft font-medium">Tavily Credits Used</div> {/* title */}
            <div className="text-2xl font-semibold text-ink">{health.instance.tavilyCredits}</div> {/* credits */}
            <div className="text-xs text-ink-soft">Search + accessibility extracts</div> {/* note */}
          </div> {/* closes card */}
        </div> {/* closes counters */}

        {/* Recent runs table */}
        <div className="space-y-3"> {/* runs table section */}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Recent Runs in this Instance</h3> {/* title */}
          {health.instance.recentRuns.length === EMPTY_COLLECTION_LENGTH ? ( // empty check
            <p className="text-xs text-ink-soft italic bg-sand/40 p-4 rounded-xl border border-line">No runs executed in this server instance yet.</p> // empty message
          ) : ( // runs exist
            <div className="overflow-x-auto border border-line rounded-xl"> {/* responsive table wrapper */}
              <table className="w-full text-left text-xs"> {/* table */}
                <thead className="bg-sand/80 border-b border-line text-ink-soft font-medium"> {/* header */}
                  <tr> {/* row */}
                    <th className="py-2.5 px-3">Time</th> {/* header cell */}
                    <th className="py-2.5 px-3">Destination</th> {/* header cell */}
                    <th className="py-2.5 px-3">Mode</th> {/* header cell */}
                    <th className="py-2.5 px-3">Status</th> {/* header cell */}
                    <th className="py-2.5 px-3 text-right">Rounds</th> {/* header cell */}
                    <th className="py-2.5 px-3 text-right">Spend ($)</th> {/* header cell */}
                    <th className="py-2.5 px-3 text-right">Duration (s)</th> {/* header cell */}
                  </tr> {/* closes row */}
                </thead> {/* closes thead */}
                <tbody className="divide-y divide-line"> {/* tbody */}
                  {health.instance.recentRuns.map((run, index) => ( // maps runs
                    <tr key={`${run.at}-${index}`} className="hover:bg-sand/30"> {/* data row */}
                      <td className="py-2.5 px-3 font-mono text-ink-soft">{run.at.slice(11, 19)}</td> {/* time */}
                      <td className="py-2.5 px-3 font-medium text-ink">{run.destination}</td> {/* destination */}
                      <td className="py-2.5 px-3"> {/* mode */}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${run.mode === "live" ? "bg-lake-soft text-lake" : "bg-marigold-soft text-marigold"}`}> {/* mode badge */}
                          {run.mode} {/* mode text */}
                        </span> {/* closes mode badge */}
                      </td> {/* closes td */}
                      <td className="py-2.5 px-3"> {/* status */}
                        <span className={`font-medium ${run.status === "completed" ? "text-ok" : "text-ink-soft"}`}>{run.status}</span> {/* status */}
                      </td> {/* closes td */}
                      <td className="py-2.5 px-3 text-right font-mono">{run.rounds}</td> {/* rounds */}
                      <td className="py-2.5 px-3 text-right font-mono">${run.estUsd.toFixed(USD_DECIMAL_PLACES)}</td> {/* spend */}
                      <td className="py-2.5 px-3 text-right font-mono">{(run.ms / MS_PER_SECOND).toFixed(SECONDS_DECIMAL_PLACES)} s</td> {/* duration */}
                    </tr> // closes data row
                  ))} {/* ends runs map */}
                </tbody> {/* closes tbody */}
              </table> {/* closes table */}
            </div> // closes table wrapper
          )} {/* ends runs check */}
        </div> {/* closes runs section */}

        {/* Circuit Breakers and Cache Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2"> {/* two-column grid */}
          {/* Circuit Breakers list */}
          <div className="space-y-3"> {/* breaker group */}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Circuit Breakers</h3> {/* title */}
            {health.instance.breakers.length === EMPTY_COLLECTION_LENGTH ? ( // empty check
              <p className="text-xs text-ink-soft italic bg-sand/40 p-4 rounded-xl border border-line">No circuit breaker trips recorded.</p> // empty message
            ) : ( // breakers exist
              <div className="overflow-x-auto border border-line rounded-xl"> {/* table wrapper */}
                <table className="w-full text-left text-xs"> {/* table */}
                  <thead className="bg-sand/80 border-b border-line text-ink-soft font-medium"> {/* thead */}
                    <tr> {/* row */}
                      <th className="py-2 px-3">Host</th> {/* header */}
                      <th className="py-2 px-3">State</th> {/* header */}
                      <th className="py-2 px-3 text-right">Failures</th> {/* header */}
                    </tr> {/* closes row */}
                  </thead> {/* closes thead */}
                  <tbody className="divide-y divide-line"> {/* tbody */}
                    {health.instance.breakers.map((breaker) => ( // maps breakers
                      <tr key={breaker.host}> {/* row */}
                        <td className="py-2 px-3 font-mono text-ink break-all">{breaker.host}</td> {/* host */}
                        <td className="py-2 px-3"> {/* state */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${breaker.state === "closed" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}> {/* state badge */}
                            {breaker.state} {/* state text */}
                          </span> {/* closes state badge */}
                        </td> {/* closes state td */}
                        <td className="py-2 px-3 text-right font-mono">{breaker.failures}</td> {/* failures */}
                      </tr> // closes row
                    ))} {/* ends breakers map */}
                  </tbody> {/* closes tbody */}
                </table> {/* closes table */}
              </div> // closes table wrapper
            )} {/* ends breaker check */}
          </div> {/* closes breaker group */}

          {/* HTTP Cache statistics */}
          <div className="space-y-3"> {/* cache group */}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">HTTP Cache Status</h3> {/* title */}
            <div className="bg-sand/60 border border-line rounded-xl p-4 grid grid-cols-3 gap-3 text-center"> {/* metrics container */}
              <div> {/* entries */}
                <div className="text-xs text-ink-soft">Entries</div> {/* label */}
                <div className="text-lg font-semibold text-ink mt-0.5">{health.instance.cache.entries}</div> {/* value */}
              </div> {/* closes entries */}
              <div> {/* hits */}
                <div className="text-xs text-ink-soft">Hits</div> {/* label */}
                <div className="text-lg font-semibold text-ok mt-0.5">{health.instance.cache.hits}</div> {/* value */}
              </div> {/* closes hits */}
              <div> {/* misses */}
                <div className="text-xs text-ink-soft">Misses</div> {/* label */}
                <div className="text-lg font-semibold text-ink-soft mt-0.5">{health.instance.cache.misses}</div> {/* value */}
              </div> {/* closes misses */}
            </div> {/* closes metrics container */}
          </div> {/* closes cache group */}
        </div> {/* closes breakers and cache row */}
      </section> {/* closes section d */}

      {/* Section e: Admin Deep Check */}
      <section aria-labelledby="section-admin-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-6"> {/* section container */}
        <div className="border-b border-line pb-3"> {/* header */}
          <h2 id="section-admin-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            e) Admin Diagnostics & Deep Provider Probe {/* heading text */}
          </h2> {/* closes title */}
          <p className="text-xs text-ink-soft mt-1">Live upstream validation of Nebius Token Factory, Tavily plan usage, and OSM services.</p> {/* description */}
        </div> {/* closes header */}

        {/* Token input and Deep Check Trigger Form */}
        <form onSubmit={(event) => void handleDeepCheckSubmit(event)} className="space-y-4"> {/* form */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3"> {/* flex inputs row */}
            <div className="flex-1 space-y-1.5"> {/* field wrapper */}
              <label htmlFor={tokenInputId} className="text-xs font-semibold text-ink"> {/* label */}
                Admin Token {/* label text */}
              </label> {/* closes label */}
              <input // password input
                id={tokenInputId} // DOM id
                type="password" // masked password input
                value={adminTokenInput} // controlled value
                onChange={handleTokenInputChange} // change handler
                placeholder="Enter TV_ADMIN_TOKEN to authenticate deep checks" // placeholder
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-sand/60 border border-line rounded-xl text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
              /> {/* closes input */}
            </div> {/* closes field wrapper */}
            <button // deep check button
              type="submit" // submit button type
              disabled={isDeepLoading} // disabled while loading
              className="min-h-11 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-white bg-lake hover:bg-lake/90 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake disabled:opacity-50 flex items-center justify-center gap-2" // styling
            > {/* button content */}
              {isDeepLoading && <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />} {/* spinner */}
              <span>{isDeepLoading ? "Checking Providers..." : "Run Deep Check"}</span> {/* text */}
            </button> {/* closes button */}
          </div> {/* closes flex row */}
        </form> {/* closes form */}

        {/* Display Deep Check error banner (e.g. 401 Admin token rejected) */}
        {deepError && ( // conditional error display
          <div role="alert" className="p-4 rounded-xl bg-warn/10 border border-warn/30 text-warn text-xs sm:text-sm font-medium flex items-center gap-2"> {/* alert banner */}
            <span aria-hidden="true">⚠️</span> {/* warning emoji */}
            <span>{deepError}</span> {/* error message */}
          </div> // closes alert banner
        )} {/* ends error display */}

        {/* Render deep check results if present in health data */}
        {health.deep && ( // conditional deep results
          <div className="space-y-6 pt-2 border-t border-line"> {/* deep results container */}
            <div className="flex items-center justify-between text-xs text-ink-soft"> {/* check timestamp */}
              <span>Deep check completed at: <strong className="text-ink">{new Date(health.deep.checkedAt).toLocaleTimeString()}</strong></span> {/* timestamp */}
              <span className="text-ok font-semibold">✓ Verified with x-tv-admin</span> {/* verified badge */}
            </div> {/* closes timestamp */}

            {/* Providers list */}
            <div className="space-y-3"> {/* providers group */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Upstream Service Providers</h3> {/* title */}
              <div className="overflow-x-auto border border-line rounded-xl"> {/* table wrapper */}
                <table className="w-full text-left text-xs"> {/* table */}
                  <thead className="bg-sand/80 border-b border-line text-ink-soft font-medium"> {/* thead */}
                    <tr> {/* row */}
                      <th className="py-2.5 px-3">Provider</th> {/* header */}
                      <th className="py-2.5 px-3">Status</th> {/* header */}
                      <th className="py-2.5 px-3 text-right">Latency</th> {/* header */}
                      <th className="py-2.5 px-3">Detail</th> {/* header */}
                    </tr> {/* closes row */}
                  </thead> {/* closes thead */}
                  <tbody className="divide-y divide-line"> {/* tbody */}
                    {health.deep.providers.map((provider) => ( // maps providers
                      <tr key={provider.name} className="hover:bg-sand/30"> {/* row */}
                        <td className="py-2.5 px-3 font-semibold text-ink">{provider.name}</td> {/* name */}
                        <td className="py-2.5 px-3"> {/* status */}
                          <span className={`inline-flex items-center gap-1 font-medium ${provider.ok ? "text-ok" : "text-warn"}`}> {/* status label */}
                            <span aria-hidden="true">{provider.ok ? "✓" : "✗"}</span> {/* icon */}
                            <span>{provider.ok ? "Reachable" : "Failed"}</span> {/* text */}
                          </span> {/* closes label */}
                        </td> {/* closes status */}
                        <td className="py-2.5 px-3 text-right font-mono text-ink-soft">{provider.ms} ms</td> {/* latency */}
                        <td className="py-2.5 px-3 font-mono text-ink-soft text-[11px] break-all">{provider.detail}</td> {/* detail */}
                      </tr> // closes row
                    ))} {/* ends providers map */}
                  </tbody> {/* closes tbody */}
                </table> {/* closes table */}
              </div> // closes table wrapper
            </div> {/* closes providers group */}

            {/* Model IDs listed vs not listed */}
            <div className="space-y-3"> {/* model ids group */}
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Active Model ID Verification on Nebius /v1/models</h3> {/* title */}
              <div className="overflow-x-auto border border-line rounded-xl"> {/* table wrapper */}
                <table className="w-full text-left text-xs"> {/* table */}
                  <thead className="bg-sand/80 border-b border-line text-ink-soft font-medium"> {/* thead */}
                    <tr> {/* row */}
                      <th className="py-2.5 px-3">Configured Model ID</th> {/* header */}
                      <th className="py-2.5 px-3">Listing Status</th> {/* header */}
                      <th className="py-2.5 px-3">Note</th> {/* header */}
                    </tr> {/* closes row */}
                  </thead> {/* closes thead */}
                  <tbody className="divide-y divide-line"> {/* tbody */}
                    {health.deep.models.map((model) => ( // maps models
                      <tr key={model.id} className="hover:bg-sand/30"> {/* row */}
                        <td className="py-2.5 px-3 font-mono font-medium text-ink break-all">{model.id}</td> {/* id */}
                        <td className="py-2.5 px-3"> {/* status */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${model.found ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn font-bold"}`}> {/* badge */}
                            {model.found ? "Found" : "NOT listed"} {/* label */}
                          </span> {/* closes badge */}
                        </td> {/* closes status */}
                        <td className="py-2.5 px-3 text-ink-soft text-[11px]">{model.note}</td> {/* note */}
                      </tr> // closes row
                    ))} {/* ends models map */}
                  </tbody> {/* closes tbody */}
                </table> {/* closes table */}
              </div> // closes table wrapper
            </div> {/* closes model ids group */}

            {/* Tavily Plan usage details */}
            {health.deep.tavily && ( // checks tavily details
              <div className="bg-sand/60 border border-line rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"> {/* tavily card */}
                <div> {/* label group */}
                  <div className="text-xs text-ink-soft font-medium">Tavily Account Plan</div> {/* title */}
                  <div className="text-sm font-semibold text-ink mt-0.5 capitalize">{health.deep.tavily.plan} Plan</div> {/* plan */}
                </div> {/* closes label group */}
                <div className="text-xs text-ink"> {/* usage info */}
                  <span className="font-semibold">{health.deep.tavily.used ?? "?"}</span> credits used of <span className="font-semibold">{health.deep.tavily.limit ?? "unlimited"}</span> {/* limit */}
                </div> {/* closes usage info */}
              </div> // closes tavily card
            )} {/* ends tavily check */}
          </div> // closes deep results
        )} {/* ends health.deep check */}
      </section> {/* closes section e */}

      {/* Section f: Model routing (admin) */}
      <section aria-labelledby="section-routing-title" className="bg-card border border-line rounded-2xl p-6 shadow-sm space-y-6"> {/* section container */}
        <div className="border-b border-line pb-3"> {/* header */}
          <h2 id="section-routing-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            f) Model Routing Overrides (Admin) {/* heading text */}
          </h2> {/* closes title */}
          <p className="text-xs text-ink-soft mt-1">
            Override the active LLM assigned to each role. Select an allowed model for fast, planner, or escalation tasks. {/* description */}
          </p> {/* closes description */}
        </div> {/* closes header */}

        {/* Three selects for fast, planner, escalation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5"> {/* three-column grid */}
          {/* Fast role select */}
          <div className="space-y-1.5"> {/* field wrapper */}
            <label htmlFor={fastSelectId} className="text-xs font-semibold text-ink"> {/* label */}
              Fast Model Override {/* label text */}
            </label> {/* closes label */}
            <select // select dropdown
              id={fastSelectId} // DOM id
              value={currentFast} // selected value
              onChange={(event) => handleRouteSelectChange("fast", event.target.value)} // change handler
              className="w-full px-3 py-2 text-xs bg-sand/60 border border-line rounded-xl text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
            > {/* dropdown options */}
              {health.allowlist.map((modelId) => ( // maps allowlist
                <option key={`fast-${modelId}`} value={modelId}> {/* option */}
                  {shortModelName(modelId)} ({modelId}) {/* readable option text */}
                </option> // closes option
              ))} {/* ends options map */}
            </select> {/* closes select */}
          </div> {/* closes field wrapper */}

          {/* Planner role select */}
          <div className="space-y-1.5"> {/* field wrapper */}
            <label htmlFor={plannerSelectId} className="text-xs font-semibold text-ink"> {/* label */}
              Planner Model Override {/* label text */}
            </label> {/* closes label */}
            <select // select dropdown
              id={plannerSelectId} // DOM id
              value={currentPlanner} // selected value
              onChange={(event) => handleRouteSelectChange("planner", event.target.value)} // change handler
              className="w-full px-3 py-2 text-xs bg-sand/60 border border-line rounded-xl text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
            > {/* dropdown options */}
              {health.allowlist.map((modelId) => ( // maps allowlist
                <option key={`planner-${modelId}`} value={modelId}> {/* option */}
                  {shortModelName(modelId)} ({modelId}) {/* readable option text */}
                </option> // closes option
              ))} {/* ends options map */}
            </select> {/* closes select */}
          </div> {/* closes field wrapper */}

          {/* Escalation role select */}
          <div className="space-y-1.5"> {/* field wrapper */}
            <label htmlFor={escalationSelectId} className="text-xs font-semibold text-ink"> {/* label */}
              Escalation Model Override {/* label text */}
            </label> {/* closes label */}
            <select // select dropdown
              id={escalationSelectId} // DOM id
              value={currentEscalation} // selected value
              onChange={(event) => handleRouteSelectChange("escalation", event.target.value)} // change handler
              className="w-full px-3 py-2 text-xs bg-sand/60 border border-line rounded-xl text-ink font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
            > {/* dropdown options */}
              {health.allowlist.map((modelId) => ( // maps allowlist
                <option key={`escalation-${modelId}`} value={modelId}> {/* option */}
                  {shortModelName(modelId)} ({modelId}) {/* readable option text */}
                </option> // closes option
              ))} {/* ends options map */}
            </select> {/* closes select */}
          </div> {/* closes field wrapper */}
        </div> {/* closes selects grid */}

        {/* Save and Reset buttons row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2"> {/* actions row */}
          <div className="flex items-center gap-3"> {/* button group */}
            <button // save button
              type="button" // button type
              onClick={handleSaveRouteOverride} // click handler
              className="min-h-11 px-5 py-2 rounded-xl text-xs sm:text-sm font-medium text-white bg-lake hover:bg-lake/90 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
            > {/* label */}
              Save Override {/* text */}
            </button> {/* closes button */}
            <button // reset button
              type="button" // button type
              onClick={handleResetRouteOverride} // click handler
              className="min-h-11 px-5 py-2 rounded-xl text-xs sm:text-sm font-medium text-ink bg-card hover:bg-sand border border-line shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // styling
            > {/* label */}
              Reset to Defaults {/* text */}
            </button> {/* closes button */}
          </div> {/* closes button group */}

          {/* Required Note statement */}
          <div className="text-xs text-ink-soft italic"> {/* note text container */}
            Applies only in this browser, only with the admin token set. {/* required prompt text */}
          </div> {/* closes note text */}
        </div> {/* closes actions row */}

        {/* Feedback notice message */}
        {routeNotice && ( // conditional notice display
          <div role="status" className="p-3.5 rounded-xl bg-lake-soft border border-lake/30 text-lake text-xs sm:text-sm font-medium"> {/* notice box */}
            {routeNotice} {/* notice string */}
          </div> // closes notice box
        )} {/* ends notice conditional */}
      </section> {/* closes section f */}

      {/* Section g: Kill switch help */}
      <section aria-labelledby="section-killswitch-title" className="bg-sand/70 border border-marigold/30 rounded-2xl p-6 shadow-sm space-y-3"> {/* section container */}
        <div className="flex items-center gap-2"> {/* title row */}
          <span className="text-base" aria-hidden="true">🛑</span> {/* stop sign icon */}
          <h2 id="section-killswitch-title" className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title */}
            g) Kill Switch Guidance {/* heading text */}
          </h2> {/* closes title */}
        </div> {/* closes title row */}
        {/* Exact required kill switch guidance string */}
        <p className="text-xs sm:text-sm text-ink-soft leading-relaxed font-mono bg-card p-4 rounded-xl border border-line"> {/* callout box */}
          To stop all spend: Vercel &gt; Settings &gt; Environment Variables &gt; TV_LIVE_ENABLED=false &gt; Redeploy. Replay keeps working. {/* required kill switch text */}
        </p> {/* closes callout box */}
      </section> {/* closes section g */}
    </div> // closes main container
  ); // ends return
} // ends ControlRoom component
