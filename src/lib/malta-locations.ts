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
