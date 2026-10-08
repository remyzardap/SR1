/* Image studio: camera choices, the sample photographs that preview them, and the
   direction sentence that carries them to the engine.

   The preview is real photography (Unsplash, credited below) composed live:
   - camera angle picks the photograph (overhead, high and low have their own; eye level uses the light's)
   - light picks the photograph at eye level, and grades the angle photographs elsewhere
   - shot and lens zoom toward the cup's measured focal point; long lenses blur the edges
   - shape crops, tilted rotates, film adds grain and fade, ink prints a halftone
   - painted and clay show a real style reference
   The engine still draws the final picture; the choices reach it as words in the prompt. */

export type AspectRatio = "1:1" | "4:3" | "16:9" | "3:4" | "9:16";

export type ShotId = "detail" | "close" | "medium" | "wide";
export type AngleId = "top" | "high" | "eye" | "low" | "dutch";
export type LensId = "24" | "35" | "50" | "85" | "100";
export type LightId = "window" | "golden" | "studio" | "backlit" | "night";
export type LookId = "photo" | "film" | "painted" | "clay" | "ink";

export interface Shot {
  shot: ShotId;
  angle: AngleId;
  lens: LensId;
  light: LightId;
  look: LookId;
  ratio: AspectRatio;
}

export type CameraGroup = Exclude<keyof Shot, "ratio">;
export type StudioGroup = keyof Shot;

export interface StudioOption<T extends string = string> {
  id: T;
  label: string;
  sub: string;
  /** Words added to the prompt for this choice. */
  words: string;
}

export const DEFAULT_SHOT: Shot = { shot: "medium", angle: "eye", lens: "50", light: "window", look: "photo", ratio: "1:1" };

export const OPTIONS: { [G in CameraGroup]: StudioOption<Shot[G]>[] } = {
  shot: [
    { id: "detail", label: "Detail", sub: "Rim and texture", words: "extreme close up detail shot" },
    { id: "close", label: "Close up", sub: "Subject fills the frame", words: "close up shot" },
    { id: "medium", label: "Medium", sub: "Subject and table", words: "medium shot" },
    { id: "wide", label: "Wide", sub: "The whole corner", words: "wide shot showing the whole scene" },
  ],
  angle: [
    { id: "top", label: "Overhead", sub: "90° flat lay", words: "overhead flat lay from directly above" },
    { id: "high", label: "High", sub: "45° down", words: "high angle looking down at 45 degrees" },
    { id: "eye", label: "Eye level", sub: "Straight on", words: "at eye level, straight on" },
    { id: "low", label: "Low", sub: "Looking up", words: "low angle looking up" },
    { id: "dutch", label: "Tilted", sub: "8° dutch", words: "tilted dutch angle" },
  ],
  lens: [
    { id: "24", label: "24mm", sub: "Wide, deep focus", words: "24mm wide lens with deep focus" },
    { id: "35", label: "35mm", sub: "A little wide", words: "35mm lens" },
    { id: "50", label: "50mm", sub: "Like the eye", words: "50mm lens" },
    { id: "85", label: "85mm", sub: "Soft background", words: "85mm lens with a soft, blurred background" },
    { id: "100", label: "100mm macro", sub: "Razor thin focus", words: "100mm macro lens with razor thin focus" },
  ],
  light: [
    { id: "window", label: "Soft window", sub: "Morning, from the left", words: "soft morning window light from the left" },
    { id: "golden", label: "Golden hour", sub: "Warm, long shadows", words: "warm golden hour light with long shadows" },
    { id: "studio", label: "Studio", sub: "Even, seamless", words: "even studio light on a seamless background" },
    { id: "backlit", label: "Backlit", sub: "Glow from behind", words: "backlit, with a glow from behind" },
    { id: "night", label: "Night lamp", sub: "One warm pool", words: "lit by a single warm lamp at night" },
  ],
  look: [
    { id: "photo", label: "Photo", sub: "True to life", words: "A true to life photograph." },
    { id: "film", label: "Film", sub: "Grain and fade", words: "Shot on film, with grain and faded colour." },
    { id: "painted", label: "Painted", sub: "Watercolour", words: "Painted as a watercolour." },
    { id: "clay", label: "Clay 3D", sub: "Soft studio render", words: "Rendered as soft clay in 3D." },
    { id: "ink", label: "Ink and dots", sub: "Halftone print", words: "Printed as a black ink halftone." },
  ],
};

/** Shapes the engines accept, in the order shown. */
export const SHAPES: Array<StudioOption<AspectRatio> & { r: number }> = [
  { id: "1:1", label: "Square", sub: "1:1", words: "", r: 1 },
  { id: "4:3", label: "Landscape", sub: "4:3", words: "", r: 4 / 3 },
  { id: "16:9", label: "Wide", sub: "16:9", words: "", r: 16 / 9 },
  { id: "3:4", label: "Portrait", sub: "3:4", words: "", r: 3 / 4 },
  { id: "9:16", label: "Story", sub: "9:16", words: "", r: 9 / 16 },
];

export const GROUP_TITLES: Record<StudioGroup, string> = {
  shot: "Shot",
  angle: "Camera angle",
  lens: "Lens",
  light: "Light",
  look: "Look",
  ratio: "Shape",
};

export function optionOf<G extends CameraGroup>(group: G, id: Shot[G]): StudioOption<Shot[G]> {
  return OPTIONS[group].find((o) => o.id === id) ?? OPTIONS[group][0];
}

export function shapeOf(id: AspectRatio) {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0];
}

/** One sentence the engine reads after the person's own prompt. */
export function direction(s: Shot): string {
  const lens = s.look === "photo" || s.look === "film" ? `, ${optionOf("lens", s.lens).words}` : "";
  const camera = `${optionOf("shot", s.shot).words}, ${optionOf("angle", s.angle).words}${lens}, ${optionOf("light", s.light).words}.`;
  return `${camera.charAt(0).toUpperCase()}${camera.slice(1)} ${optionOf("look", s.look).words}`;
}

/* ── Sample photographs ─────────────────────────────────────────────────── */

export type PhotoName =
  | "light-window" | "light-golden" | "light-studio" | "light-backlit" | "light-night"
  | "angle-top" | "angle-high" | "angle-low"
  | "look-painted" | "look-clay";

interface Photo {
  by: string;
  /** Unsplash photo id, for the credit link. */
  id: string;
  /** Focal point of the subject, in % of the frame. */
  f: [number, number];
  /** Focal point for Detail (the rim), when it differs. */
  rim?: [number, number];
}

export const PHOTOS: Record<PhotoName, Photo> = {
  "light-window": { by: "Thomas Park", id: "1591745742384-ee81ec590924", f: [66, 62], rim: [63, 41] },
  "light-golden": { by: "Barney Goodman", id: "1781460877110-6988cbaf0eb0", f: [56, 70], rim: [53, 52] },
  "light-studio": { by: "Giorgio Trovato", id: "1680818080459-1b9ad0e9cd78", f: [50, 46], rim: [46, 15] },
  "light-backlit": { by: "René Porter", id: "1561766926-a7c863179e15", f: [60, 66], rim: [61, 46] },
  "light-night": { by: "Olena Bohovyk", id: "1671207549881-94b69004888a", f: [50, 52], rim: [51, 46] },
  "angle-top": { by: "Debby Hudson", id: "1652703747774-558a10faacc2", f: [51, 50], rim: [51, 50] },
  "angle-high": { by: "Erik Witsoe", id: "1523179985834-1363f5c47d84", f: [52, 52], rim: [51, 47] },
  "angle-low": { by: "Zach Lezniewicz", id: "1547583881-58685cb3210f", f: [47, 57], rim: [47, 49] },
  "look-painted": { by: "Europeana", id: "1741119336848-4e2eb08b9709", f: [46, 56] },
  "look-clay": { by: "BlushStudio Creations", id: "1744853261830-5167b853519f", f: [50, 58] },
};

export const PHOTO_CREDITS = Array.from(new Set(Object.values(PHOTOS).map((p) => p.by)));

const SHOT_Z: Record<ShotId, number> = { detail: 2.2, close: 1.5, medium: 1.12, wide: 1 };
const LENS_Z: Record<LensId, number> = { "24": 1, "35": 1.02, "50": 1.06, "85": 1.16, "100": 1.34 };
const LENS_BLUR: Record<LensId, number> = { "24": 0, "35": 0, "50": 0.6, "85": 3.2, "100": 6.5 };

export interface Composition {
  photo: PhotoName;
  /** Grade the photograph toward the chosen light (angle photographs only). */
  grade: LightId | null;
  look: LookId;
  focus: [number, number];
  zoom: number;
  rotate: number;
  /** Depth of field blur at a 520 px wide frame. */
  blur: number;
}

/** What the preview shows for a set of choices. */
export function compose(s: Shot): Composition {
  if (s.look === "painted" || s.look === "clay") {
    /* A style reference, framed by the chosen shot; lens and angle photographs do not apply. */
    const photo: PhotoName = s.look === "clay" ? "look-clay" : "look-painted";
    const shot = s.shot === "detail" ? "close" : s.shot;
    let zoom = SHOT_Z[shot] * LENS_Z["24"];
    const rotate = s.angle === "dutch" ? -8 : 0;
    if (rotate) zoom *= 1.22;
    return { photo, grade: null, look: s.look, focus: PHOTOS[photo].f, zoom: Math.min(zoom, 3.4), rotate, blur: 0 };
  }
  const angled = s.angle === "top" || s.angle === "high" || s.angle === "low";
  const photo: PhotoName = angled ? (`angle-${s.angle}` as PhotoName) : (`light-${s.light}` as PhotoName);
  const ph = PHOTOS[photo];
  let zoom = SHOT_Z[s.shot] * LENS_Z[s.lens];
  const rotate = s.angle === "dutch" ? -8 : 0;
  if (rotate) zoom *= 1.22;
  return {
    photo,
    grade: angled ? s.light : null,
    look: s.look,
    focus: s.shot === "detail" && ph.rim ? ph.rim : ph.f,
    zoom: Math.min(zoom, 3.4),
    rotate,
    blur: LENS_BLUR[s.lens],
  };
}

/**
 * Smallest stored size that stays sharp: 480, 800 or 1280 px wide.
 * needPx is the frame width in device pixels times the zoom; a frame narrower than the
 * photo (portrait or square crops of a 3:2 photograph) uses fewer of its pixels, so it needs more.
 */
export function photoSrc(name: PhotoName, framePx: number, frameAspect: number): string {
  const needPx = framePx * Math.max(1, 1.5 / frameAspect);
  const size = needPx <= 480 ? "t" : needPx <= 820 ? "m" : "l";
  return `/studio/${size}/${name}.webp`;
}

export const photoTile = (name: PhotoName) => `/studio/t/${name}.webp`;
