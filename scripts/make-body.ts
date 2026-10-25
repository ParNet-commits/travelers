/** Prints a POST /api/plan body for the Riya preset. Usage: npx tsx scripts/make-body.ts live|replay > body.json */
import { riyaPreset } from "../replay/presets.js";

const mode = process.argv[2] === "replay" ? "replay" : "live";
console.log(JSON.stringify({ trip: riyaPreset(), mode, presetId: "riya", routeOverride: null }));
