/* Studio photograph manifest.
 *
 * Typed copy of the prototype's photo.js PHOTOS object, plus the cover images
 * from docs.js. All files are WebP, stored under /studio/{t,m,l,c}/ with the
 * same names so the prototype's photo.js src() mapping works unchanged.
 *
 * Groups:
 *   - "light"      : the five eye-level light photographs
 *   - "angle"      : overhead, high and low camera angles
 *   - "variant"    : alternate takes for each light (var-*-2/3/4)
 *   - "style"      : painted and clay look references
 *   - "engine"     : engine tile photographs (eng-*)
 *   - "reference"  : the ref photograph
 *   - "cover"      : document cover photographs from img/c/
 */

export type PhotoGroup =
  | "light"
  | "angle"
  | "variant"
  | "style"
  | "engine"
  | "reference"
  | "cover";

export type PhotoSize = "t" | "m" | "l";

export interface PhotoManifestEntry {
  id: string;
  group: PhotoGroup;
  /** File name (without extension) for each size. Only "t" for engine/reference. */
  file: Record<PhotoSize, string> | { t: string };
  /** Photographer name for credit. */
  photographer: string;
  /** Unsplash photo page URL. */
  sourceUrl: string;
  /** Licence — all are Unsplash License. */
  licence: "Unsplash License";
  /** Focal point of the subject in percent of the frame [x%, y%]. */
  focalPoint: [number, number];
  /** Focal point for Detail shot (the rim), when it differs. */
  rimPoint?: [number, number];
  /** Whether this photo only exists at the "t" size (tileOnly in photo.js). */
  tileOnly?: true;
}

const UNSPLASH_BASE = "https://unsplash.com/photos/";

export const PHOTO_MANIFEST: readonly PhotoManifestEntry[] = [
  /* Light photographs (eye level) */
  {
    id: "light-window",
    group: "light",
    file: { t: "light-window", m: "light-window", l: "light-window" },
    photographer: "Thomas Park",
    sourceUrl: UNSPLASH_BASE + "1591745742384-ee81ec590924",
    licence: "Unsplash License",
    focalPoint: [66, 62],
    rimPoint: [63, 41],
  },
  {
    id: "light-golden",
    group: "light",
    file: { t: "light-golden", m: "light-golden", l: "light-golden" },
    photographer: "Barney Goodman",
    sourceUrl: UNSPLASH_BASE + "1781460877110-6988cbaf0eb0",
    licence: "Unsplash License",
    focalPoint: [56, 70],
    rimPoint: [53, 52],
  },
  {
    id: "light-studio",
    group: "light",
    file: { t: "light-studio", m: "light-studio", l: "light-studio" },
    photographer: "Giorgio Trovato",
    sourceUrl: UNSPLASH_BASE + "1680818080459-1b9ad0e9cd78",
    licence: "Unsplash License",
    focalPoint: [50, 46],
    rimPoint: [46, 15],
  },
  {
    id: "light-backlit",
    group: "light",
    file: { t: "light-backlit", m: "light-backlit", l: "light-backlit" },
    photographer: "René Porter",
    sourceUrl: UNSPLASH_BASE + "1561766926-a7c863179e15",
    licence: "Unsplash License",
    focalPoint: [60, 66],
    rimPoint: [61, 46],
  },
  {
    id: "light-night",
    group: "light",
    file: { t: "light-night", m: "light-night", l: "light-night" },
    photographer: "Olena Bohovyk",
    sourceUrl: UNSPLASH_BASE + "1671207549881-94b69004888a",
    licence: "Unsplash License",
    focalPoint: [50, 52],
    rimPoint: [51, 46],
  },

  /* Angle photographs */
  {
    id: "angle-top",
    group: "angle",
    file: { t: "angle-top", m: "angle-top", l: "angle-top" },
    photographer: "Debby Hudson",
    sourceUrl: UNSPLASH_BASE + "1652703747774-558a10faacc2",
    licence: "Unsplash License",
    focalPoint: [51, 50],
    rimPoint: [51, 50],
  },
  {
    id: "angle-high",
    group: "angle",
    file: { t: "angle-high", m: "angle-high", l: "angle-high" },
    photographer: "Erik Witsoe",
    sourceUrl: UNSPLASH_BASE + "1523179985834-1363f5c47d84",
    licence: "Unsplash License",
    focalPoint: [52, 52],
    rimPoint: [51, 47],
  },
  {
    id: "angle-low",
    group: "angle",
    file: { t: "angle-low", m: "angle-low", l: "angle-low" },
    photographer: "Zach Lezniewicz",
    sourceUrl: UNSPLASH_BASE + "1547583881-58685cb3210f",
    licence: "Unsplash License",
    focalPoint: [47, 57],
    rimPoint: [47, 49],
  },

  /* Variant photographs (alternate takes for each light) */
  {
    id: "var-window-2",
    group: "variant",
    file: { t: "var-window-2", m: "var-window-2", l: "var-window-2" },
    photographer: "Thabet Studio",
    sourceUrl: UNSPLASH_BASE + "1644889017176-c97b128dece3",
    licence: "Unsplash License",
    focalPoint: [48, 56],
  },
  {
    id: "var-window-3",
    group: "variant",
    file: { t: "var-window-3", m: "var-window-3", l: "var-window-3" },
    photographer: "Barney Goodman",
    sourceUrl: UNSPLASH_BASE + "1781460903505-c82fe437be4b",
    licence: "Unsplash License",
    focalPoint: [50, 70],
  },
  {
    id: "var-window-4",
    group: "variant",
    file: { t: "var-window-4", m: "var-window-4", l: "var-window-4" },
    photographer: "engin akyurt",
    sourceUrl: UNSPLASH_BASE + "1769412340371-c9f18ea1e71f",
    licence: "Unsplash License",
    focalPoint: [48, 34],
  },
  {
    id: "var-golden-2",
    group: "variant",
    file: { t: "var-golden-2", m: "var-golden-2", l: "var-golden-2" },
    photographer: "Charmil Gandhi",
    sourceUrl: UNSPLASH_BASE + "1771736385651-c071580a9d78",
    licence: "Unsplash License",
    focalPoint: [50, 58],
  },
  {
    id: "var-golden-3",
    group: "variant",
    file: { t: "var-golden-3", m: "var-golden-3", l: "var-golden-3" },
    photographer: "tabitha turner",
    sourceUrl: UNSPLASH_BASE + "1596098823457-74e360fcd023",
    licence: "Unsplash License",
    focalPoint: [55, 74],
  },
  {
    id: "var-golden-4",
    group: "variant",
    file: { t: "var-golden-4", m: "var-golden-4", l: "var-golden-4" },
    photographer: "Jei Lee",
    sourceUrl: UNSPLASH_BASE + "1678068317141-13ef6a709354",
    licence: "Unsplash License",
    focalPoint: [53, 42],
  },
  {
    id: "var-studio-2",
    group: "variant",
    file: { t: "var-studio-2", m: "var-studio-2", l: "var-studio-2" },
    photographer: "Daniel Dan",
    sourceUrl: UNSPLASH_BASE + "1740593021483-a898ac0d4ab7",
    licence: "Unsplash License",
    focalPoint: [36, 42],
  },
  {
    id: "var-studio-3",
    group: "variant",
    file: { t: "var-studio-3", m: "var-studio-3", l: "var-studio-3" },
    photographer: "Monaz Nazary",
    sourceUrl: UNSPLASH_BASE + "1771623117490-58382d47f882",
    licence: "Unsplash License",
    focalPoint: [50, 48],
  },
  {
    id: "var-studio-4",
    group: "variant",
    file: { t: "var-studio-4", m: "var-studio-4", l: "var-studio-4" },
    photographer: "Daniel Dan",
    sourceUrl: UNSPLASH_BASE + "1740593022235-becbadbcaf97",
    licence: "Unsplash License",
    focalPoint: [36, 48],
  },
  {
    id: "var-backlit-2",
    group: "variant",
    file: { t: "var-backlit-2", m: "var-backlit-2", l: "var-backlit-2" },
    photographer: "Tim Foster",
    sourceUrl: UNSPLASH_BASE + "1526385159909-196a9ac0ef64",
    licence: "Unsplash License",
    focalPoint: [44, 86],
  },
  {
    id: "var-backlit-3",
    group: "variant",
    file: { t: "var-backlit-3", m: "var-backlit-3", l: "var-backlit-3" },
    photographer: "Jocelyn Morales",
    sourceUrl: UNSPLASH_BASE + "1611162458324-aae1eb4129a4",
    licence: "Unsplash License",
    focalPoint: [57, 56],
  },
  {
    id: "var-backlit-4",
    group: "variant",
    file: { t: "var-backlit-4", m: "var-backlit-4", l: "var-backlit-4" },
    photographer: "Luca Massimilian",
    sourceUrl: UNSPLASH_BASE + "1590082871875-064201a27373",
    licence: "Unsplash License",
    focalPoint: [52, 62],
  },
  {
    id: "var-night-2",
    group: "variant",
    file: { t: "var-night-2", m: "var-night-2", l: "var-night-2" },
    photographer: "Olena Bohovyk",
    sourceUrl: UNSPLASH_BASE + "1671207589776-730a149bc597",
    licence: "Unsplash License",
    focalPoint: [40, 69],
  },
  {
    id: "var-night-3",
    group: "variant",
    file: { t: "var-night-3", m: "var-night-3", l: "var-night-3" },
    photographer: "Martyn Yakub",
    sourceUrl: UNSPLASH_BASE + "1636405348751-3a7faad27231",
    licence: "Unsplash License",
    focalPoint: [34, 71],
  },
  {
    id: "var-night-4",
    group: "variant",
    file: { t: "var-night-4", m: "var-night-4", l: "var-night-4" },
    photographer: "John Forson",
    sourceUrl: UNSPLASH_BASE + "1518358246973-95637f1df901",
    licence: "Unsplash License",
    focalPoint: [52, 80],
  },

  /* Style reference photographs */
  {
    id: "look-painted",
    group: "style",
    file: { t: "look-painted", m: "look-painted", l: "look-painted" },
    photographer: "Europeana",
    sourceUrl: UNSPLASH_BASE + "1741119336848-4e2eb08b9709",
    licence: "Unsplash License",
    focalPoint: [46, 56],
  },
  {
    id: "look-clay",
    group: "style",
    file: { t: "look-clay", m: "look-clay", l: "look-clay" },
    photographer: "BlushStudio Creations",
    sourceUrl: UNSPLASH_BASE + "1744853261830-5167b853519f",
    licence: "Unsplash License",
    focalPoint: [50, 58],
  },

  /* Engine tile photographs (tileOnly: only "t" size exists) */
  {
    id: "eng-gemini",
    group: "engine",
    file: { t: "eng-gemini" },
    photographer: "Brett Jordan",
    sourceUrl: UNSPLASH_BASE + "1610454059772-5c751844f937",
    licence: "Unsplash License",
    focalPoint: [50, 50],
    tileOnly: true,
  },
  {
    id: "eng-openai",
    group: "engine",
    file: { t: "eng-openai" },
    photographer: "pariwat pannium",
    sourceUrl: UNSPLASH_BASE + "1647919234555-3d06e2c923f4",
    licence: "Unsplash License",
    focalPoint: [50, 60],
    tileOnly: true,
  },
  {
    id: "eng-wan",
    group: "engine",
    file: { t: "eng-wan" },
    photographer: "Danielle-Claude Bélanger",
    sourceUrl: UNSPLASH_BASE + "1733338638542-45e79232a3df",
    licence: "Unsplash License",
    focalPoint: [50, 50],
    tileOnly: true,
  },

  /* Reference photograph (tileOnly) */
  {
    id: "ref",
    group: "reference",
    file: { t: "ref" },
    photographer: "Charmil Gandhi",
    sourceUrl: UNSPLASH_BASE + "1771736385651-c071580a9d78",
    licence: "Unsplash License",
    focalPoint: [45, 55],
    tileOnly: true,
  },

  /* Cover photographs (from img/c/, only "l" size used by prototype) */
  {
    id: "cov-solar",
    group: "cover",
    file: { t: "cov-solar", m: "cov-solar", l: "cov-solar" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-solar",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-jakarta-bw",
    group: "cover",
    file: { t: "cov-jakarta-bw", m: "cov-jakarta-bw", l: "cov-jakarta-bw" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-jakarta-bw",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-jakarta",
    group: "cover",
    file: { t: "cov-jakarta", m: "cov-jakarta", l: "cov-jakarta" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-jakarta",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-panels",
    group: "cover",
    file: { t: "cov-panels", m: "cov-panels", l: "cov-panels" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-panels",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-pylons",
    group: "cover",
    file: { t: "cov-pylons", m: "cov-pylons", l: "cov-pylons" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-pylons",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-village",
    group: "cover",
    file: { t: "cov-village", m: "cov-village", l: "cov-village" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-village",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-villa",
    group: "cover",
    file: { t: "cov-villa", m: "cov-villa", l: "cov-villa" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-villa",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
  {
    id: "cov-clay",
    group: "cover",
    file: { t: "cov-clay", m: "cov-clay", l: "cov-clay" },
    photographer: "Unsplash contributor",
    sourceUrl: UNSPLASH_BASE + "cov-clay",
    licence: "Unsplash License",
    focalPoint: [50, 50],
  },
] as const;

/** Return the public URL for a photo at a given size. */
export function photoUrl(id: string, size: PhotoSize): string {
  const entry = PHOTO_MANIFEST.find((p) => p.id === id);
  if (!entry) {
    throw new Error(`Photo not found: ${id}`);
  }
  const fileEntry = entry.file as Record<string, string>;
  const isTileOnly = entry.tileOnly === true;
  const effectiveSize = isTileOnly ? "t" : size;
  const fileName = fileEntry[effectiveSize] ?? fileEntry.t;
  const dir = entry.group === "cover" ? "c" : effectiveSize;
  return `/studio/${dir}/${fileName}.webp`;
}

/** Return a deduplicated list of photographer names for credits. */
export function credits(): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of PHOTO_MANIFEST) {
    if (!seen.has(entry.photographer)) {
      seen.add(entry.photographer);
      result.push(entry.photographer);
    }
  }
  return result;
}

/** Look up a manifest entry by id. */
export function getPhoto(id: string): PhotoManifestEntry | undefined {
  return PHOTO_MANIFEST.find((p) => p.id === id);
}

/** All photo ids. */
export const ALL_PHOTO_IDS = PHOTO_MANIFEST.map((p) => p.id) as readonly string[];

/** Photo ids filtered by group. */
export function photoIdsByGroup(group: PhotoGroup): readonly string[] {
  return PHOTO_MANIFEST.filter((p) => p.group === group).map((p) => p.id);
}