/**
 * Every Maltese locality (local council), Malta and Gozo, plus a generic
 * "Remote / Malta-wide" and "Gozo" catch-all for preference matching.
 * Source of truth: Malta's local council boundaries (68 localities).
 */
export const MALTA_LOCALITIES = [
  "Attard",
  "Balzan",
  "Birgu (Vittoriosa)",
  "Birkirkara",
  "Birżebbuġa",
  "Bormla (Cospicua)",
  "Dingli",
  "Fgura",
  "Floriana",
  "Fontana",
  "Gudja",
  "Gżira",
  "Għajnsielem",
  "Għarb",
  "Għargħur",
  "Għasri",
  "Għaxaq",
  "Ħamrun",
  "Iklin",
  "Kalkara",
  "Kerċem",
  "Kirkop",
  "Lija",
  "Luqa",
  "Marsa",
  "Marsaskala",
  "Marsaxlokk",
  "Mdina",
  "Mellieħa",
  "Mġarr",
  "Mosta",
  "Mqabba",
  "Msida",
  "Mtarfa",
  "Munxar",
  "Nadur",
  "Naxxar",
  "Paola",
  "Pembroke",
  "Pietà",
  "Qala",
  "Qormi",
  "Qrendi",
  "Rabat (Malta)",
  "Safi",
  "San Lawrenz",
  "San Ġwann",
  "Sannat",
  "Santa Luċija",
  "Santa Venera",
  "Siġġiewi",
  "Sliema",
  "St Julian's",
  "St Paul's Bay",
  "Bugibba",
  "Qawra",
  "Swieqi",
  "Ta' Xbiex",
  "Tarxien",
  "Valletta",
  "Victoria (Rabat, Gozo)",
  "Xagħra",
  "Xewkija",
  "Xgħajra",
  "Żabbar",
  "Żebbuġ (Malta)",
  "Żebbuġ (Gozo)",
  "Żejtun",
  "Żurrieq",
] as const;

export type MaltaLocality = (typeof MALTA_LOCALITIES)[number];

/** Broader location groupings used in preference pickers and job filters. */
export const LOCATION_REGIONS = [
  { label: "Any locality in Malta", value: "any" },
  { label: "Remote (Malta-based employer)", value: "remote" },
  { label: "Gozo", value: "gozo" },
  ...MALTA_LOCALITIES.map((l) => ({ label: l, value: l })),
];

const GOZO_LOCALITIES = new Set([
  "Fontana",
  "Għajnsielem",
  "Għarb",
  "Għasri",
  "Kerċem",
  "Munxar",
  "Nadur",
  "Qala",
  "San Lawrenz",
  "Sannat",
  "Victoria (Rabat, Gozo)",
  "Xagħra",
  "Xewkija",
  "Żebbuġ (Gozo)",
]);

export function isGozoLocality(locality: string | null | undefined): boolean {
  if (!locality) return false;
  return GOZO_LOCALITIES.has(locality);
}

export function normalizeLocality(input: string): MaltaLocality | null {
  const needle = input.trim().toLowerCase();
  const match = MALTA_LOCALITIES.find(
    (l) => l.toLowerCase() === needle || l.toLowerCase().replace(/\s*\(.*\)$/, "") === needle
  );
  return match ?? null;
}

/**
 * Shared "All Malta" location-selection behavior for job_preferences.locations,
 * used by both the onboarding Preferences step and the standalone Preferences
 * settings page so the two forms can never drift apart.
 *
 * "All Malta" is stored as the sentinel value "any" — the same value
 * computeMatchScore (src/lib/ai/matching.ts) already treats as "no locality
 * restriction". It is deliberately kept out of MALTA_LOCALITIES so it can
 * never be confused with, or persisted as, a real Maltese locality.
 */
export const ALL_MALTA_LOCATIONS_VALUE = "any";

/** The locations value representing "match every locality in Malta". */
export function selectAllMaltaLocations(): string[] {
  return [ALL_MALTA_LOCATIONS_VALUE];
}

/** True when a saved/selected locations value is unrestricted (All Malta), including legacy empty arrays. */
export function isAllMaltaLocations(locations: string[] | null | undefined): boolean {
  return !locations || locations.length === 0 || locations.includes(ALL_MALTA_LOCATIONS_VALUE);
}

/**
 * Toggles a single locality in/out of a locations selection. Selecting any
 * individual locality clears "All Malta" first; deselecting the last
 * remaining individual locality falls back to "All Malta" rather than
 * leaving an ambiguous empty selection.
 */
export function toggleMaltaLocality(current: string[], locality: string): string[] {
  const withoutAllMalta = current.filter((l) => l !== ALL_MALTA_LOCATIONS_VALUE);
  if (withoutAllMalta.includes(locality)) {
    const next = withoutAllMalta.filter((l) => l !== locality);
    return next.length ? next : selectAllMaltaLocations();
  }
  return [...withoutAllMalta, locality];
}

/**
 * Whether a single locality checkbox should render as checked. When "All
 * Malta" is active every locality is implicitly included, so each checkbox
 * displays as checked even though the saved value stays the "any" sentinel
 * — the full locality list is never written out. Clicking any locality
 * while All Malta is active still goes through toggleMaltaLocality, which
 * drops "any" and keeps only that one locality, exiting All Malta mode.
 */
export function isMaltaLocalitySelected(locations: string[], locality: string): boolean {
  return isAllMaltaLocations(locations) || locations.includes(locality);
}
