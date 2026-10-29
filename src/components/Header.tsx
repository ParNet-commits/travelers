// Import React module for JSX rendering
import type { JSX } from "react"; // imports JSX type definition
// Import useRun hook to read the active agent run mode and offline status
import { useRun } from "../state/RunProvider.js"; // context consumer for agent state

// Intent: Render application header with brand identity, tagline, status pill, and control room navigation
export function Header(): JSX.Element { // exports Header component
  // Retrieve agent state from global run context
  const { state } = useRun(); // extracts active state object

  // Determine user-friendly status label and visual styling based on run mode and offline state
  let statusLabel = "Idle"; // default status when no planning run is in progress
  // CSS class string for pill background, text color, and border
  let pillStyle = "bg-sand text-ink-soft border-line"; // default neutral style
  // Dot indicator styling to convey activity
  let dotStyle = "bg-ink-soft/40"; // neutral muted dot

  // Check if system is currently replaying bundled run offline due to server unreachable
  if (state.offline) { // offline fallback condition
    // Set descriptive label for offline mode
    statusLabel = "Offline replay"; // indicates recorded playback without network
    // Warning-tinted pill styling
    pillStyle = "bg-marigold-soft text-warn border-marigold/30"; // warn styling
    // Amber dot indicator
    dotStyle = "bg-warn"; // warn dot
  } else if (state.mode === "replay") { // check for explicit replay mode
    // Set replay label
    statusLabel = "Replay"; // indicates golden run playback
    // Marigold-tinted pill styling
    pillStyle = "bg-marigold-soft text-marigold border-marigold/30"; // replay styling
    // Marigold dot indicator
    dotStyle = "bg-marigold"; // marigold dot
  } else if (state.mode === "live" || state.status === "connecting" || state.status === "streaming") { // check for live execution
    // Set live active label
    statusLabel = "Live"; // indicates real-time agent execution
    // Lake blue styling for active live run
    pillStyle = "bg-lake-soft text-lake border-lake/30"; // active live styling
    // Pulsing lake blue dot
    dotStyle = "bg-lake animate-pulse"; // animated pulsing indicator
  } // ends status conditions

  // Render header navigation bar
  return ( // returns header JSX element
    <header className="border-b border-line bg-card/80 backdrop-blur-sm"> {/* header container with blur */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"> {/* responsive content container */}
        {/* Brand identity group containing logo title and philosophy tagline */}
        <div className="flex items-baseline space-x-3"> {/* logo and tagline flex container */}
          <a // home link element
            href="/" // navigates to root planner
            className="text-2xl font-semibold tracking-tight text-ink font-display focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake rounded-md" // serif display typography
          > {/* link body */}
            TravelVerse {/* brand name */}
          </a> {/* closes home link */}
          <span className="hidden sm:inline-block text-xs font-medium text-ink-soft/80 tracking-wide border-l border-line pl-3"> {/* tagline container with separator */}
            Plans that check themselves {/* brand philosophy statement */}
          </span> {/* closes tagline */}
        </div> {/* closes brand identity group */}

        {/* Right side group containing status indicator pill and control room link */}
        <div className="flex items-center space-x-3"> {/* right actions container */}
          {/* Status pill displaying current state with both text and icon indicator */}
          <div // status pill wrapper
            role="status" // accessibility status role
            aria-label={`Agent status: ${statusLabel}`} // screen reader label
            className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${pillStyle} transition-colors`} // pill styling
          > {/* status pill body */}
            <span className={`w-2 h-2 rounded-full ${dotStyle}`} aria-hidden="true" /> {/* dot icon indicator */}
            <span>{statusLabel}</span> {/* readable text status */}
          </div> {/* closes status pill */}

          {/* Navigation link to Control Room dashboard */}
          <a // link to administrative control room
            href="/control" // URL path to control room
            className="min-h-11 inline-flex items-center px-3.5 py-2 text-xs font-medium text-ink-soft hover:text-ink hover:bg-sand rounded-xl border border-transparent hover:border-line transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // accessible clickable link styling
          > {/* link body */}
            Control Room {/* link label */}
          </a> {/* closes control room link */}
        </div> {/* closes right actions container */}
      </div> {/* closes responsive container */}
    </header> // closes header
  ); // ends return
} // ends Header component
