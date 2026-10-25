---
name: add-city-data
description: Research and add a curated CityPack (places, stays, meals, taxis, arrivals) with a source and date for every number.
---
# Add or update curated city data

Rules: never invent a number. Every curated price needs `sourceUrl` + `asOf` (YYYY-MM-DD). If you cannot find a
reliable value, use `ticketPerPerson: null` (engine will estimate and label it) or `stepFree: "unverified"`.

1. Read `types/travelverse.ts` (CityPack, Place, Lodging, PricedAmount, OpeningHours) and `server/data/cities/index.ts`.
2. Research with the browser/web tools. Prefer official sites (palace trusts, tourism departments, hotel sites).
   For hotels use the hotel's own site or a booking page for the target dates; record the exact URL and date.
3. For accessibility, quote the source in `stepFreeNote` and put the page in `stepFreeSourceUrl`. Use:
   step_free (ramps/lifts/level access stated), partial (some areas), not_step_free (stairs unavoidable), unverified (no clear statement).
4. Coordinates: from OpenStreetMap (open the place on openstreetmap.org, copy lat/lon to 4-5 decimals).
5. Opening hours: weekly rules with days 0=Sun..6=Sat, HH:MM 24h; add closedDates for known closures.
6. Ids: `<city>:<kebab-name>`, lowercase. Currency: the local currency in minor units (INR paise: Rs 400 -> 40000).
7. Save as `server/data/cities/<city>.ts` exporting a typed `CityPack`, register it in `index.ts`.
8. Run `npm run check:data` until it reports 0 errors; list the remaining warnings in your report.
