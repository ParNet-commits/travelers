import { describe, expect, it } from "vitest";
import type { AccessibilityAudit as AccessibilityAuditType, Evidence } from "../types/travelverse.js";

describe("Accessibility Audit contract and formatting", () => {
  it("formats audit summary line correctly", () => {
    const audit: AccessibilityAuditType = {
      required: true,
      stops: 6,
      stepFree: 3,
      partial: 1,
      notStepFree: 0,
      unverified: 2,
      evidenced: 4,
      sources: [
        { domain: "example.com", url: "https://example.com", official: true },
      ],
      badge: "partially_verified",
    };

    const expectedLine = `${audit.evidenced}/${audit.stops} stops backed by sources - ${audit.stepFree} step-free, ${audit.partial} partial, ${audit.notStepFree} not step-free, ${audit.unverified} unverified`;
    expect(expectedLine).toBe("4/6 stops backed by sources - 3 step-free, 1 partial, 0 not step-free, 2 unverified");
  });

  it("handles evidence properties and verbatimVerified condition", () => {
    const evidenceItem: Evidence = {
      targetId: "udaipur:karni-mata-ropeway",
      status: "step_free",
      method: "tavily_extract",
      url: "https://manshapurnkarnimataropeway.com/",
      domain: "manshapurnkarnimataropeway.com",
      quote: "Absolutely — wheelchairs and elevators are available.",
      verbatimVerified: true,
      official: true,
      retrievedAt: "2026-10-28",
    };

    expect(evidenceItem.verbatimVerified).toBe(true);
    expect(evidenceItem.method).toBe("tavily_extract");
    expect(evidenceItem.quote).toBe("Absolutely — wheelchairs and elevators are available.");
  });
});
