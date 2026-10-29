// Import React JSX type for typing component return values
import type { JSX } from "react"; // React JSX namespace
// Import AccessibilityAudit schema type from shared domain contracts
import type { AccessibilityAudit as AccessibilityAuditType } from "../../types/travelverse.js"; // shared audit contract

// Define named constant for zero count threshold
const ZERO_COUNT = 0; // threshold for empty collections

// Define named constant for badge string mapping
const BADGE_CONFIG = { // mapping from audit badge enum to UI display details
  verified: { // verified step-free configuration
    label: "Verified step-free", // badge text label
    classes: "bg-ok/10 text-ok border-ok/30", // green color tokens
  }, // ends verified
  partially_verified: { // partly verified configuration
    label: "Partly verified", // badge text label
    classes: "bg-warn/10 text-warn border-warn/30", // amber color tokens
  }, // ends partially_verified
  unverified: { // unverified fallback configuration
    label: "Unverified", // badge text label
    classes: "bg-sand text-ink-soft border-line", // muted sand color tokens
  }, // ends unverified
} as const; // typed as immutable lookup table

// Props interface for AccessibilityAudit component
export interface AccessibilityAuditProps { // props specification
  // Accessibility audit record from final or draft itinerary
  audit?: AccessibilityAuditType | null; // optional audit object
} // ends AccessibilityAuditProps interface

// Intent: Render accessibility audit badge, stops summary line, source chips, and Tavily attribution
export function AccessibilityAudit({ audit }: AccessibilityAuditProps): JSX.Element | null { // exports audit badge component
  // Guard clause: hide audit card if audit data is missing or badge indicates accessibility was not requested
  if (!audit || audit.badge === "not_required") { // check for missing data or not_required status
    return null; // returns null to render nothing
  } // ends guard

  // Resolve badge text and color configuration with fallback to unverified
  const badgeDetails = BADGE_CONFIG[audit.badge] ?? BADGE_CONFIG.unverified; // lookup badge attributes

  // Formulate the formatted audit summary line according to milestone specification
  const summaryLine = `${audit.evidenced}/${audit.stops} stops backed by sources - ${audit.stepFree} step-free, ${audit.partial} partial, ${audit.notStepFree} not step-free, ${audit.unverified} unverified`; // formatted statistics string

  // Render accessibility audit panel card
  return ( // returns JSX element
    <div className="bg-card border border-line rounded-2xl p-5 shadow-sm space-y-3.5"> {/* outer card container */}
      {/* Header row displaying section title, wheelchair icon, and verification badge */}
      <div className="flex items-center justify-between border-b border-line pb-3"> {/* header row */}
        {/* Title group with accessibility icon */}
        <div className="flex items-center gap-2"> {/* icon and title container */}
          <span className="w-6 h-6 rounded-lg bg-lake-soft text-lake flex items-center justify-center shrink-0 text-sm" aria-hidden="true"> {/* icon pill */}
            ♿ {/* wheelchair unicode icon */}
          </span> {/* closes icon pill */}
          <h3 className="text-sm font-semibold text-ink uppercase tracking-wider font-display"> {/* title heading */}
            Accessibility Audit {/* section heading text */}
          </h3> {/* closes title */}
        </div> {/* closes title group */}

        {/* Status verification badge */}
        <span // badge container
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeDetails.classes}`} // badge styling
        > {/* badge text */}
          {audit.badge === "verified" ? ( // checkmark icon for verified
            <svg className="w-3.5 h-3.5 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> {/* check shape */}
            </svg> // closes checkmark SVG
          ) : audit.badge === "partially_verified" ? ( // alert icon for partially verified
            <svg className="w-3.5 h-3.5 shrink-0 text-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /> {/* alert shape */}
            </svg> // closes alert SVG
          ) : ( // info icon for unverified
            <svg className="w-3.5 h-3.5 shrink-0 text-ink-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"> {/* SVG */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> {/* info shape */}
            </svg> // closes info SVG
          )} {/* ends icon switch */}
          <span>{badgeDetails.label}</span> {/* readable badge label */}
        </span> {/* closes badge */}
      </div> {/* closes header row */}

      {/* Summary line detailing evidence backing counts */}
      <p className="text-xs text-ink leading-relaxed font-medium"> {/* summary paragraph */}
        {summaryLine} {/* formatted summary line */}
      </p> {/* closes summary paragraph */}

      {/* Source chips section displaying domains with official tags */}
      {audit.sources.length > ZERO_COUNT && ( // check if any source citations exist
        <div className="space-y-1.5 pt-0.5"> {/* source chips container */}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft block"> {/* subsection label */}
            Verified Sources ({audit.sources.length}) {/* count label */}
          </span> {/* closes subsection label */}
          <div className="flex flex-wrap gap-2"> {/* flex wrap chips row */}
            {audit.sources.map((source, index) => ( // iterate through sources
              <a // source citation link
                key={`${source.domain}-${index}`} // unique React key
                href={source.url} // link destination
                target="_blank" // opens in new browser tab
                rel="noopener noreferrer" // security attributes for external link
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-sand hover:bg-sand/80 text-ink border border-line transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lake" // chip styling
                title={`Open ${source.domain} in new tab`} // browser tooltip
              > {/* chip contents */}
                <span className="font-mono text-[11px]">{source.domain}</span> {/* domain name */}
                {source.official && ( // official tag badge if verified official domain
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-lake/10 text-lake border border-lake/20"> {/* official tag pill */}
                    official {/* official label */}
                  </span> // closes official pill
                )} {/* ends official check */}
                <span className="text-ink-soft text-[10px]" aria-hidden="true">↗</span> {/* external link arrow */}
              </a> // closes source link
            ))} {/* ends sources map */}
          </div> {/* closes chips row */}
        </div> // closes source chips container
      )} {/* ends sources length check */}

      {/* Footer attribution linking to Tavily */}
      <footer className="border-t border-line/60 pt-2.5 text-[11px] text-ink-soft"> {/* footer bar */}
        <a // attribution link to Tavily
          href="https://tavily.com" // Tavily website URL
          target="_blank" // opens in new browser tab
          rel="noopener noreferrer" // security attributes
          className="inline-flex items-center gap-1 hover:text-lake transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lake underline decoration-line/80 underline-offset-2" // link styling
        > {/* link text and arrow */}
          <span>Evidence extracted from official pages with Tavily</span> {/* attribution text */}
          <span aria-hidden="true">↗</span> {/* external link arrow */}
        </a> {/* closes link */}
      </footer> {/* closes footer */}
    </div> // closes card container
  ); // ends return
} // ends AccessibilityAudit component
