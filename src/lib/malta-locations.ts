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
 * Three distinct states are represented, and MUST be kept distinct anywhere
 * this array is read or written:
 *   - ["any"]                    — All Malta: match every locality (unrestricted)
 *   - []                         — no location selected (nothing chosen yet)
 *   - ["Sliema", "Gżira", ...]   — one or more specific localities
 *
 * "All Malta" is stored as the sentinel value "any" — the same value
 * computeMatchScore (src/lib/ai/matching.ts) treats as "no locality
 * restriction". It is deliberately kept out of MALTA_LOCALITIES so it can
 * never be confused with, or persisted as, a real Maltese locality. An empty
 * array is NOT treated as All Malta — it means the user currently has no
 * location selection at all, and must be handled as its own distinct state
 * everywhere (UI checkboxes, saved preferences, and match scoring).
 */
export const ALL_MALTA_LOCATIONS_VALUE = "any";

/** The locations value representing "match every locality in Malta". */
export function selectAllMaltaLocations(): string[] {
  return [ALL_MALTA_LOCATIONS_VALUE];
}

/** True only when a locations value explicitly contains the All Malta sentinel — an empty array is a distinct, non-All-Malta state. */
export function isAllMaltaLocations(locations: string[] | null | undefined): boolean {
  return !!locations && locations.includes(ALL_MALTA_LOCATIONS_VALUE);
}

/**
 * True toggle for the "All Malta" control: OFF → ON sets the unrestricted
 * sentinel (clearing any individually selected localities); ON → OFF clears
 * the selection entirely to `[]` ("no location selected"), it does not
 * restore whatever individual localities were selected before All Malta was
 * turned on. Clicking All Malta while individual localities are selected
 * (but All Malta itself is off) also turns it on, clearing those localities.
 */
export function toggleAllMaltaLocations(current: string[]): string[] {
  return isAllMaltaLocations(current) ? [] : selectAllMaltaLocations();
}

/**
 * Toggles a single locality in/out of a locations selection. Selecting any
 * individual locality clears "All Malta" first, leaving only that locality
 * selected. Deselecting the last remaining individual locality results in
 * `[]` ("no location selected") rather than falling back to All Malta.
 */
export function toggleMaltaLocality(current: string[], locality: string): string[] {
  const withoutAllMalta = current.filter((l) => l !== ALL_MALTA_LOCATIONS_VALUE);
  if (withoutAllMalta.includes(locality)) {
    return withoutAllMalta.filter((l) => l !== locality);
  }
  return [...withoutAllMalta, locality];
}

/**
 * Whether a single locality checkbox should render as checked. When "All
 * Malta" is active every locality is implicitly included, so each checkbox
 * displays as checked even though the saved value stays the "any" sentinel
 * — the full locality list is never written out. Clicking any locality
 * while All Malta is active still goes through toggleMaltaLocality, which
 * drops "any" and keeps only that one locality, exiting All Malta mode. When
 * nothing is selected (`[]`), every checkbox — including All Malta —
 * correctly renders unchecked.
 */
export function isMaltaLocalitySelected(locations: string[], locality: string): boolean {
  return isAllMaltaLocations(locations) || locations.includes(locality);
}
