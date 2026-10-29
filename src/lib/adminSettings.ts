// Import Zod validation schema for model routes
import { ModelRoutes } from "../../types/travelverse.js"; // shared contract for model routing

// Define named constant for the localStorage key storing model route overrides
const ROUTE_OVERRIDE_STORAGE_KEY = "tv.routeOverride"; // namespaced key to prevent collisions in localStorage
// Define named constant for the sessionStorage key storing the admin token
const ADMIN_TOKEN_STORAGE_KEY = "tv.adminToken"; // namespaced key to store temporary admin credential in session

// Type alias representing a partial model route override configuration
export type RouteOverride = Partial<ModelRoutes>; // fast, planner, and/or escalation model overrides

// Intent: Retrieve the cached admin authentication token from browser session storage safely
export function getAdminToken(): string | null { // exports token reader
  // Storage access wrapped in try/catch because private browsing mode can throw
  try { // begins safety block
    // Guard against running in non-browser environments like server-side rendering
    if (typeof window === "undefined" || !window.sessionStorage) { // checks window and sessionStorage availability
      return null; // returns null when running outside browser
    } // ends guard check
    // Read raw string value from sessionStorage
    const token = window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY); // reads token by key
    // Verify token exists and contains non-whitespace characters
    if (token && token.trim().length > 0) { // checks if valid string
      return token.trim(); // returns trimmed token string
    } // ends check
    // Return null if token is missing or blank
    return null; // returns null default
  } catch { // catches any security or quota exceptions thrown by storage
    // Fallback to null on any storage read exception
    return null; // safe fallback
  } // ends try/catch
} // ends getAdminToken function

// Intent: Save or clear the admin authentication token in browser session storage safely
export function setAdminToken(token: string | null): void { // exports token writer
  // Storage access wrapped in try/catch because private browsing mode can throw
  try { // begins safety block
    // Guard against running in non-browser environments
    if (typeof window === "undefined" || !window.sessionStorage) { // checks sessionStorage availability
      return; // returns early if unavailable
    } // ends guard check
    // Check if token should be cleared
    if (token === null || token.trim().length === 0) { // checks for null or empty input
      // Remove token item from session storage
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); // removes key
    } else { // token is valid string
      // Save trimmed token string into session storage
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim()); // stores token
    } // ends conditional
  } catch { // catches storage access errors
    // Silently ignore storage write errors in restricted environments
    return; // safe return
  } // ends try/catch
} // ends setAdminToken function

// Intent: Retrieve and validate model route overrides from browser localStorage
export function getRouteOverride(): RouteOverride | null { // exports route override reader
  // Storage access wrapped in try/catch because private browsing mode can throw
  try { // begins safety block
    // Guard against running in non-browser environments
    if (typeof window === "undefined" || !window.localStorage) { // checks localStorage availability
      return null; // returns null outside browser
    } // ends guard check
    // Read raw serialized JSON from localStorage
    const raw = window.localStorage.getItem(ROUTE_OVERRIDE_STORAGE_KEY); // reads string item
    // Guard against missing storage item
    if (!raw) { // checks if null or empty
      return null; // returns null when not set
    } // ends null check
    // Parse raw string into unknown JSON data structure
    const parsedJson: unknown = JSON.parse(raw); // parses serialized JSON
    // Validate parsed object shape against partial ModelRoutes schema
    const validation = ModelRoutes.partial().safeParse(parsedJson); // zod validation
    // Verify schema validation succeeded
    if (!validation.success) { // checks validation outcome
      // Remove corrupted or incompatible override from localStorage
      window.localStorage.removeItem(ROUTE_OVERRIDE_STORAGE_KEY); // cleans invalid entry
      return null; // returns null on invalid shape
    } // ends invalid check
    // Extract validated partial routes object
    const routes = validation.data; // extracts validated data
    // Count number of defined role keys in the override object
    const definedKeyCount = Object.values(routes).filter((val) => typeof val === "string" && val.length > 0).length; // counts valid keys
    // Verify at least one role override is populated
    if (definedKeyCount === 0) { // checks for empty object
      return null; // returns null if no keys defined
    } // ends empty check
    // Return validated route override configuration
    return routes; // returns valid Partial<ModelRoutes>
  } catch { // catches JSON parsing or storage access exceptions
    // Fallback to null on any parsing or storage failure
    return null; // safe fallback
  } // ends try/catch
} // ends getRouteOverride function

// Intent: Validate and persist model route overrides to browser localStorage
export function setRouteOverride(override: RouteOverride): void { // exports route override writer
  // Storage access wrapped in try/catch because private browsing mode can throw
  try { // begins safety block
    // Guard against running in non-browser environments
    if (typeof window === "undefined" || !window.localStorage) { // checks localStorage availability
      return; // returns early
    } // ends guard check
    // Validate override argument with Zod partial schema
    const validation = ModelRoutes.partial().safeParse(override); // performs schema check
    // Verify validation succeeded
    if (!validation.success) { // checks if invalid
      return; // ignores invalid override
    } // ends check
    // Serialize validated object to JSON string
    const serialized = JSON.stringify(validation.data); // converts to JSON
    // Write serialized JSON to localStorage
    window.localStorage.setItem(ROUTE_OVERRIDE_STORAGE_KEY, serialized); // persists value
  } catch { // catches storage write errors
    // Silently ignore storage write errors in restricted environments
    return; // safe return
  } // ends try/catch
} // ends setRouteOverride function

// Intent: Remove model route overrides from browser localStorage
export function clearRouteOverride(): void { // exports route override cleaner
  // Storage access wrapped in try/catch because private browsing mode can throw
  try { // begins safety block
    // Guard against running in non-browser environments
    if (typeof window === "undefined" || !window.localStorage) { // checks localStorage availability
      return; // returns early
    } // ends guard check
    // Remove the route override item from localStorage
    window.localStorage.removeItem(ROUTE_OVERRIDE_STORAGE_KEY); // removes stored key
  } catch { // catches storage errors
    // Silently ignore storage errors in restricted environments
    return; // safe return
  } // ends try/catch
} // ends clearRouteOverride function
