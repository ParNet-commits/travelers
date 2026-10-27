/**
 * Curated city pack for Udaipur, Rajasthan, India ("City of Lakes").
 * Contains verified places, stays across budget/mid/premium tiers, daily meals, local transit, and flight arrivals.
 */
import type { CityPack, Lodging, PricedAmount } from "../../../types/travelverse.js";
import { UDAIPUR_OFFICIAL_DOMAINS, UDAIPUR_PLACES } from "./udaipur.places.js";

// Sourcing date anchor for all curated numbers in this pack
const CURATION_DATE = "2026-10-27";

/**
 * Extended list of official and primary source domains for Udaipur.
 * Includes trusts, official tourism departments, and verified hospitality/transport providers.
 */
export const UDAIPUR_EXTENDED_OFFICIAL_DOMAINS: string[] = [
  ...UDAIPUR_OFFICIAL_DOMAINS,
  "oberoihotels.com",
  "tajhotels.com",
  "radissonhotels.com",
  "jagatcollection.com",
  "mewarhaveli.com",
  "zostel.com",
  "goindigo.in",
  "budgetyourtrip.com",
  "taxifarefinder.com",
];

/**
 * Curated hotel options for Udaipur (2 premium, 2 mid, 2 budget).
 * Includes step-free accessibility details and verified nightly room rates.
 */
const UDAIPUR_LODGING: Lodging[] = [
  {
    id: "udaipur:hotel-the-oberoi-udaivilas",
    name: "The Oberoi Udaivilas",
    tier: "premium",
    location: { lat: 24.5772, lon: 73.6706 },
    nightlyPerRoom: {
      amountMinor: 7500000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://www.oberoihotels.com/hotels-in-udaipur-udaivilas-resort/",
      asOf: CURATION_DATE,
      note: "Premier room double occupancy starting Rs 75,000 per night for November dates.",
    },
    stepFree: "step_free",
    stepFreeNote: "Elevators, wide garden ramps, level resort pathways, and accessible golf cart buggy transfers.",
    stepFreeSourceUrl: "https://www.oberoihotels.com/hotels-in-udaipur-udaivilas-resort/",
    officialUrl: "https://www.oberoihotels.com/hotels-in-udaipur-udaivilas-resort/",
  },
  {
    id: "udaipur:hotel-taj-fateh-prakash-palace",
    name: "Taj Fateh Prakash Palace",
    tier: "premium",
    location: { lat: 24.576, lon: 73.6828 },
    nightlyPerRoom: {
      amountMinor: 2800000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://www.tajhotels.com/en-in/taj/taj-fateh-prakash-palace-udaipur/",
      asOf: CURATION_DATE,
      note: "Palace room double occupancy starting Rs 28,000 per night for November dates.",
    },
    stepFree: "partial",
    stepFreeNote: "Elevators and entrance ramps available; historic split levels with stairs in heritage wings.",
    stepFreeSourceUrl: "https://www.tajhotels.com/en-in/taj/taj-fateh-prakash-palace-udaipur/",
    officialUrl: "https://www.tajhotels.com/en-in/taj/taj-fateh-prakash-palace-udaipur/",
  },
  {
    id: "udaipur:hotel-radisson-udaipur",
    name: "Radisson Hotel Udaipur",
    tier: "mid",
    location: { lat: 24.5888, lon: 73.7142 },
    nightlyPerRoom: {
      amountMinor: 750000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://www.radissonhotels.com/en-us/hotels/radisson-udaipur",
      asOf: CURATION_DATE,
      note: "Superior room double occupancy from Rs 7,500 per night for November dates.",
    },
    stepFree: "step_free",
    stepFreeNote: "Accessible entrance, elevator, public restrooms, and accessible guest rooms with grab bars.",
    stepFreeSourceUrl: "https://www.radissonhotels.com/en-us/hotels/radisson-udaipur",
    officialUrl: "https://www.radissonhotels.com/en-us/hotels/radisson-udaipur",
  },
  {
    id: "udaipur:hotel-jagat-niwas-palace",
    name: "Jagat Niwas Palace",
    tier: "mid",
    location: { lat: 24.579, lon: 73.6818 },
    nightlyPerRoom: {
      amountMinor: 850000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://jagatcollection.com/portfolio/haveli/",
      asOf: CURATION_DATE,
      note: "Standard heritage room double occupancy starting Rs 8,500 per night for November dates.",
    },
    stepFree: "partial",
    stepFreeNote: "Haveli rooms are accessible by lift although steps might be involved to reach your room.",
    stepFreeSourceUrl: "https://jagatcollection.com/portfolio/haveli/",
    officialUrl: "https://jagatcollection.com/portfolio/haveli/",
  },
  {
    id: "udaipur:hotel-mewar-haveli",
    name: "Hotel Mewar Haveli",
    tier: "budget",
    location: { lat: 24.5796, lon: 73.6826 },
    nightlyPerRoom: {
      amountMinor: 240000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://mewarhaveli.com/",
      asOf: CURATION_DATE,
      note: "Standard double room starting Rs 2,400 per night for November dates.",
    },
    stepFree: "partial",
    stepFreeNote: "Passenger elevator serves all guest floors and rooftop; small threshold steps at street entrance.",
    stepFreeSourceUrl: "https://mewarhaveli.com/",
    officialUrl: "https://mewarhaveli.com/",
  },
  {
    id: "udaipur:hotel-zostel-udaipur",
    name: "Zostel Udaipur",
    tier: "budget",
    location: { lat: 24.5828, lon: 73.6806 },
    nightlyPerRoom: {
      amountMinor: 280000,
      currency: "INR",
      provenance: "curated_table",
      sourceUrl: "https://www.zostel.com/zostel/udaipur/",
      asOf: CURATION_DATE,
      note: "Private deluxe double room starting Rs 2,800 per night for November dates.",
    },
    stepFree: "not_step_free",
    stepFreeNote: "Multi-level hostel without elevator; staircases required to access all rooms and rooftop.",
    stepFreeSourceUrl: "https://www.zostel.com/zostel/udaipur/",
    officialUrl: "https://www.zostel.com/zostel/udaipur/",
  },
];

/** Daily meal costs per person by tier */
const UDAIPUR_MEALS: { budget: PricedAmount; mid: PricedAmount; premium: PricedAmount } = {
  budget: {
    amountMinor: 60000,
    currency: "INR",
    provenance: "curated_table",
    sourceUrl: "https://www.budgetyourtrip.com/india/udaipur",
    asOf: CURATION_DATE,
    note: "Local street food, thalis, and casual dining per person per day (Rs 600).",
  },
  mid: {
    amountMinor: 150000,
    currency: "INR",
    provenance: "curated_table",
    sourceUrl: "https://www.budgetyourtrip.com/india/udaipur",
    asOf: CURATION_DATE,
    note: "Mid-range sit-down cafes and rooftop dining per person per day (Rs 1,500).",
  },
  premium: {
    amountMinor: 400000,
    currency: "INR",
    provenance: "curated_table",
    sourceUrl: "https://www.budgetyourtrip.com/india/udaipur",
    asOf: CURATION_DATE,
    note: "Fine dining and heritage palace hotel restaurants per person per day (Rs 4,000).",
  },
};

/** Local taxi and auto transport fare structure */
const UDAIPUR_TRANSPORT = {
  baseFare: {
    amountMinor: 5000,
    currency: "INR" as const,
    provenance: "curated_table" as const,
    sourceUrl: "https://www.taxifarefinder.com/",
    asOf: CURATION_DATE,
    note: "Standard auto/taxi flag drop fare in Udaipur (Rs 50).",
  },
  perKm: {
    amountMinor: 1500,
    currency: "INR" as const,
    provenance: "curated_table" as const,
    sourceUrl: "https://www.taxifarefinder.com/",
    asOf: CURATION_DATE,
    note: "Standard auto/taxi per-kilometer rate in Udaipur (Rs 15).",
  },
  seatsPerVehicle: 4,
};

/** Arrival transit options */
const UDAIPUR_ARRIVALS = [
  {
    fromCity: "Mumbai",
    mode: "flight" as const,
    roundTripPerPerson: {
      amountMinor: 1080000,
      currency: "INR" as const,
      provenance: "curated_table" as const,
      sourceUrl: "https://www.goindigo.in/",
      asOf: CURATION_DATE,
      note: "IndiGo return flight Mumbai (BOM) - Udaipur (UDR) economy round trip (Rs 10,800).",
    },
  },
];

/** Complete curated CityPack for Udaipur */
export const UDAIPUR: CityPack = {
  id: "udaipur",
  name: "Udaipur",
  aliases: ["udaipur india", "udaipur rajasthan", "city of lakes"],
  country: "IN",
  currency: "INR",
  center: { lat: 24.5787, lon: 73.6863 },
  timezone: "Asia/Kolkata",
  places: UDAIPUR_PLACES,
  lodging: UDAIPUR_LODGING,
  mealsPerPersonPerDay: UDAIPUR_MEALS,
  localTransport: UDAIPUR_TRANSPORT,
  arrivals: UDAIPUR_ARRIVALS,
  officialDomains: UDAIPUR_EXTENDED_OFFICIAL_DOMAINS,
};
