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

// Import ControlRoom component for administrative dashboard
import { ControlRoom } from "./pages/ControlRoom.js"; // administrative control room dashboard

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
    // Intercept relative link clicks for client-side navigation without full reloads
    const handleDocumentClick = (event: MouseEvent) => { // global click interceptor
      const targetElement = event.target as HTMLElement | null; // target DOM node
      const anchorElement = targetElement?.closest("a"); // finds closest anchor tag
      if (!anchorElement) return; // ignore non-link clicks
      const href = anchorElement.getAttribute("href"); // reads href attribute
      if (href && href.startsWith("/") && !href.startsWith("//") && !anchorElement.target && !anchorElement.hasAttribute("download")) { // internal link check
        event.preventDefault(); // prevents browser full page reload
        if (href !== window.location.pathname) { // only update when path changes
          window.history.pushState({}, "", href); // updates browser history
          setPathname(href); // updates React pathname state
        } // ends path check
      } // ends internal link check
    }; // ends handleDocumentClick
    // Subscribe to popstate event
    window.addEventListener("popstate", handlePopState); // registers listener
    // Subscribe to document click event for navigation interception
    document.addEventListener("click", handleDocumentClick); // registers click listener
    // Cleanup event listeners when unmounting
    return () => { // cleanup function
      window.removeEventListener("popstate", handlePopState); // unregisters popstate
      document.removeEventListener("click", handleDocumentClick); // unregisters click listener
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
            <ControlRoom /> // renders control room dashboard on /control
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
