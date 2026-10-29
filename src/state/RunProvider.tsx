// Import React core hooks and types for creating context and provider
import { createContext, useContext, useMemo, useState, type ReactNode } from "react"; // React context and state management primitives
// Import PlanRequestBody type for typed start requests
import type { PlanRequestBody } from "../../types/travelverse.js"; // shared contract for plan request payload
// Import useAgentStream hook that manages SSE streaming and agent reducer state
import { useAgentStream } from "../hooks/useAgentStream.js"; // hook managing agent lifecycle and SSE connection
// Import admin settings helper function for route overrides
import { getRouteOverride } from "../lib/adminSettings.js"; // reads stored route overrides
// Import AgentState interface to describe current planning run state
import type { AgentState } from "../lib/agentReducer.js"; // state machine interface for agent runs

// Define shape of the shared context provided to the entire application
export interface RunContextValue { // specifies all state and actions exposed by RunProvider
  // The current state of the travel agent run
  state: AgentState; // includes status, events, round, draft, final itinerary, and errors
  // Function to initiate a planning run with a given request body
  start: (body: PlanRequestBody) => Promise<void>; // sends plan request and begins event streaming
  // Function to abort the active planning run
  stop: () => void; // closes active SSE connection and aborts in-flight requests
  // Function to select an option when a trade-off is required
  choose: (optionId: "A" | "B") => void; // dispatches user selection for trade-off resolution
  // Function to reset run state back to initial idle conditions
  reset: () => void; // resets all accumulated run state and stops streaming
  // The currently selected itinerary day index (null if none selected)
  selectedDay: number | null; // active day index in itinerary view
  // Function to update the currently selected itinerary day index
  setSelectedDay: (day: number | null) => void; // state updater for selectedDay
} // ends RunContextValue interface

// Create React context with null default to enforce wrapping with RunProvider
const RunContext = createContext<RunContextValue | null>(null); // holds global run context reference

// Intent: Provide shared travel planning state and control functions across the component tree
export function RunProvider({ children }: { children: ReactNode }) { // exports context provider component
  // Instantiate underlying agent streaming hook with default options
  const agentStream = useAgentStream(); // manages SSE stream, agent reducer, and abort controller
  // Track the active itinerary day selected by the user for inspection
  const [selectedDay, setSelectedDay] = useState<number | null>(null); // stores active day index or null

  // Wrap start function to ensure routeOverride from localStorage and admin credentials are included
  const start = useMemo(() => { // memoizes start wrapper
    // Return wrapped asynchronous start function
    return async (body: PlanRequestBody): Promise<void> => { // typed start implementation
      // Resolve route override from body or browser localStorage
      const routeOverride = body.routeOverride !== undefined ? body.routeOverride : (getRouteOverride() ?? null); // retrieves override or null
      // Delegate to underlying agent stream start with merged body
      return agentStream.start({ // calls underlying hook start
        ...body, // passes trip parameters and mode
        routeOverride, // attaches route override
      }); // ends start call
    }; // ends wrapped start
  }, [agentStream]); // depends on agentStream reference

  // Memoize context value object to prevent unnecessary re-renders of consuming components
  const contextValue: RunContextValue = useMemo(() => { // computes memoized value for consumers
    // Construct composite value merging agent stream methods with day selection state
    return { // returns context object
      state: agentStream.state, // current agent state
      start, // start planning function with route override injection
      stop: agentStream.stop, // stop planning function
      choose: agentStream.choose, // trade-off choose function
      reset: agentStream.reset, // reset state function
      selectedDay, // currently active day index
      setSelectedDay, // updater for selected day
    }; // closes composite context value
  }, [agentStream, start, selectedDay]); // recomputes whenever stream reference, start, or selectedDay changes

  // Render context provider wrapping child components
  return ( // returns JSX provider element
    <RunContext.Provider value={contextValue}> {/* passes memoized run context value */}
      {children} {/* renders nested child components */}
    </RunContext.Provider> // closes context provider
  ); // ends return
} // ends RunProvider component

// Intent: Custom hook to safely consume RunContext with guard against missing provider
export function useRun(): RunContextValue { // exports consumer hook
  // Read current context value from React hierarchy
  const context = useContext(RunContext); // gets current context or null
  // Guard against usage outside of RunProvider tree
  if (!context) { // checks if context is missing
    // Throw descriptive error if component is improperly placed outside provider
    throw new Error("useRun must be used within a RunProvider"); // descriptive error for developers
  } // ends guard check
  // Return typed non-null context value
  return context; // returns active RunContextValue
} // ends useRun hook
