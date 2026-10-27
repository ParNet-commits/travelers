/**
 * Validation tests for Udaipur curated places data.
 * Verifies schema conformance, ID conventions, price provenance, and sourcing.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Place } from "../types/travelverse.js";
import { UDAIPUR_OFFICIAL_DOMAINS, UDAIPUR_PLACES } from "../server/data/cities/udaipur.places.js";

describe("Udaipur curated places data", () => {
  it("conforms strictly to the Place Zod schema", () => {
    // Validates all places against shared Place contract
    const result = z.array(Place).safeParse(UDAIPUR_PLACES);
    if (!result.success) {
      console.error(result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it("has unique ids that all start with 'udaipur:' prefix", () => {
    // Validates ID prefix and uniqueness across places
    const ids = new Set<string>();
    for (const place of UDAIPUR_PLACES) {
      expect(place.id.startsWith("udaipur:")).toBe(true);
      expect(ids.has(place.id)).toBe(false);
      ids.add(place.id);
    }
    expect(ids.size).toBe(14);
  });

  it("ensures every non-null ticketPerPerson has provenance 'curated_table', sourceUrl, and asOf", () => {
    // Validates price provenance requirement for curated data
    for (const place of UDAIPUR_PLACES) {
      if (place.ticketPerPerson !== null) {
        expect(place.ticketPerPerson.provenance).toBe("curated_table");
        expect(typeof place.ticketPerPerson.sourceUrl).toBe("string");
        expect(place.ticketPerPerson.sourceUrl?.startsWith("https://")).toBe(true);
        expect(place.ticketPerPerson.asOf).toBeDefined();
        expect(place.ticketPerPerson.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("exports official domains list with verified domains", () => {
    // Validates official domains export
    expect(Array.isArray(UDAIPUR_OFFICIAL_DOMAINS)).toBe(true);
    expect(UDAIPUR_OFFICIAL_DOMAINS.length).toBeGreaterThan(0);
    for (const domain of UDAIPUR_OFFICIAL_DOMAINS) {
      expect(typeof domain).toBe("string");
      expect(domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });
});
