// Import React hooks and type definitions
import { useEffect, useState, type JSX } from "react"; // React hooks for state and lifecycle
// Import Header component for brand and status bar
import { Header } from "./components/Header.js"; // top navigation and agent status header
// Import ReplayBanner component for sticky top replay notifications
import { ReplayBanner } from "./components/ReplayBanner.js"; // sticky top replay notice banner
// Import TradeoffDialog component for human-in-the-loop decisions
import { TradeoffDialog } from "./components/TradeoffDialog.js"; // accessible trade-off decision modal
// Import PlannerPage component for primary travel planning interface
import { PlannerPage } from "./pages/PlannerPage.js"; // main travel planner view
// Import RunProvider to supply shared planning context to the application
import { RunProvider } from "./state/RunProvider.js"; // context provider for agent run state

// Intent: Render placeholder component for Control Room admin dashboard coming in milestone P17
function ControlRoomPlaceholder(): JSX.Element { // helper component for /control route
  // Render placeholder interface styled with warm cards and typography
  return ( // returns placeholder JSX
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12"> {/* centered container */}
      <div className="bg-card border border-line rounded-2xl p-8 shadow-sm space-y-4 text-center"> {/* card box */}
        <span className="inline-flex items-center text-xs font-semibold tracking-wider uppercase text-marigold"> {/* milestone badge */}
          Milestone P17 {/* milestone badge text */}
        </span> {/* closes badge */}
        <h2 className="text-2xl font-semibold text-ink font-display"> {/* title heading */}
          Control Room - coming in P17 {/* heading text */}
        </h2> {/* closes title */}
        <p className="text-sm text-ink-soft max-w-md mx-auto leading-relaxed"> {/* description */}
          Live model latency probes, Nebius token consumption, Tavily credit burn, and deep system diagnostics will be available here. {/* explanation text */}
        </p> {/* closes description */}
        <div className="pt-4"> {/* actions container */}
          <a // return to planner navigation link
            href="/" // link target
            className="min-h-11 inline-flex items-center px-5 py-2.5 rounded-xl font-medium text-sm text-white bg-lake hover:bg-lake/90 shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // accessible button styling
          > {/* link content */}
            Back to Planner {/* link label */}
          </a> {/* closes return link */}
        </div> {/* closes actions */}
      </div> {/* closes card box */}
    </div> // closes container
  ); // ends return
} // ends ControlRoomPlaceholder

// Intent: Root application component providing routing between /control and / with RunProvider wrapper
export default function App(): JSX.Element { // exports root App component
  // State tracking the current browser pathname
  const [pathname, setPathname] = useState<string>(() => { // initializes pathname from window
    // Safe check for browser window object
    if (typeof window !== "undefined") { // window presence check
      return window.location.pathname; // returns current path
    } // ends check
    return "/"; // fallback default path
  }); // ends useState

  // Listen to browser popstate events for backward and forward navigation
  useEffect(() => { // lifecycle hook for history changes
    // Handler function when browser navigation occurs
    const handlePopState = () => { // popstate event callback
      setPathname(window.location.pathname); // updates pathname state
    }; // ends handlePopState
    // Subscribe to popstate event
    window.addEventListener("popstate", handlePopState); // registers listener
    // Cleanup event listener when unmounting
    return () => { // cleanup function
      window.removeEventListener("popstate", handlePopState); // unregisters listener
    }; // ends cleanup
  }, []); // runs once on mount

  // Check if current path matches control room route
  const isControlRoom = pathname === "/control"; // boolean check for control route

  // Render root application tree wrapped in RunProvider
  return ( // returns root application JSX
    <RunProvider> {/* provides shared planning state across application */}
      <div className="min-h-screen flex flex-col bg-sand text-ink"> {/* full-height flex layout wrapper */}
        {/* Sticky top wrapper containing replay notice banner and navigation header */}
        <div className="sticky top-0 z-30"> {/* sticky container */}
          {/* Sticky top replay notification banner */}
          <ReplayBanner /> {/* renders sticky replay banner when notice is active */}
          {/* Navigation header with status pill and brand logo */}
          <Header /> {/* renders persistent header */}
        </div> {/* closes sticky container */}

        {/* Main page content area */}
        <main className="flex-1"> {/* flex growing main container */}
          {isControlRoom ? ( // conditional rendering based on path
            <ControlRoomPlaceholder /> // renders control room placeholder on /control
          ) : ( // default route
            <PlannerPage /> // renders main trip planner on all other routes
          )} {/* ends conditional */}
        </main> {/* closes main */}

        {/* Accessible modal trade-off decision dialog */}
        <TradeoffDialog /> {/* opens when human decision is required */}
      </div> {/* closes flex layout wrapper */}
    </RunProvider> // closes RunProvider
  ); // ends return
} // ends App component
