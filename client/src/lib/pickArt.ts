/* Picture-card art for every choice picker (Studio standard).
 *
 * Each id maps to /studio/o/<id>.webp (720x540, 4:3). The value is a short
 * description of the picture, for alt text where the image is not decorative.
 * Files live in client/public/studio/o/ and are not part of the service-worker
 * precache (sw.js precaches only the app shell list); they are cached on first
 * view like the other /studio/ photographs.
 *
 * Agent builder output types (Report/Deck/Sheet/Image/Brief/Monitor) keep their
 * own art in the app and are not listed here.
 */

export const PICK_ART = {
  /* Chat modes */
  fast: "Streaks of light flying out of a phone",
  research: "A desk of open books and a magnifying glass",
  image: "A watercolour landscape spilling out of a camera",
  document: "A neat printed report beside a pen and coffee",
  code: "A laptop with code glowing on a desk at night",

  /* Outputs */
  "out-report": "A bound report beside reading glasses",
  "out-slides": "A chart on a big screen in a quiet meeting room",
  "out-table": "A printed grid with highlighted cells",
  "out-monitor": "A small screen with a calm chart and one orange light",

  /* Document types */
  "doc-proposal": "A leather folder with a pen and wax seal",
  "doc-report": "Printed charts fanned out on a desk",
  "doc-resume": "A one-page CV on a desk beside a plant",
  "doc-letter": "A handwritten letter and envelope by candlelight",

  /* Improve a document */
  rewrite: "A hand reworking a page with a red pencil",
  reformat: "Messy papers on the left, a tidy stack on the right",
  "reformat-before": "A messy pile of scattered papers",
  "reformat-after": "The same papers in one tidy stack",

  /* Model */
  "model-auto": "A glowing compass choosing a direction",
  "model-fast": "A paper plane gliding fast",
  "model-best": "A crystal prism splitting light",

  /* Sources */
  "src-web": "A globe wrapped in glowing lines",
  "src-files": "A drawer of paper files",
  "src-drive": "A brass key beside a cloud-shaped lantern",

  /* Engines and Studio samples */
  "eng-forge": "A row of glowing servers in a dark room",
  "forge-mountain": "A cabin by a misty mountain lake at sunrise",
  "forge-coffee": "A cup of coffee by a window at golden hour",
  "forge-1": "A coffee cup on a windowsill at golden hour",
  "forge-2": "Coffee and an open notebook from above",
  "forge-3": "A cabin on a misty lake at dawn",
  "forge-4": "The rim of a coffee mug, close up",
  "forge-5": "A cosy reading corner at night",
  "forge-6": "A backlit coffee cup at sunset",

  /* Menu destinations */
  "nav-chat": "Two cups of tea on a café table",
  "nav-agent": "A drafting desk with tools laid out",
  "nav-images": "A camera beside a paint palette",
  "nav-documents": "A neat stack of paper",
  "nav-files": "A filing drawer of folders",
  "nav-video": "A film reel on a table",

  /* Research depth */
  "depth-quick": "A pebble skipping across a lake",
  "depth-standard": "Sunlight reaching a few metres under water",
  "depth-deep": "A spiral staircase going deep down",

  /* Tone */
  "tone-confident": "A chess king in a spotlight",
  "tone-friendly": "Two mugs of cocoa clinking",
  "tone-formal": "A boardroom table set in order",
  "tone-plain": "A plain bowl and wooden spoon",

  /* Length */
  "len-short": "A single index card",
  "len-medium": "A two-page letter",
  "len-long": "A thick tied manuscript",

  /* Style */
  "style-keep": "An old book kept under glass",
  "style-modern": "A clean modern desk",
  "style-classic": "A classic desk with inkwell and seal",

  /* Settings: theme, motion, voice */
  "theme-dark": "A phone on a desk at night",
  "theme-light": "A phone on a desk in daylight",
  "theme-auto": "A phone on a desk at dusk",
  "motion-full": "Light trails swirling around a mobile",
  "motion-reduced": "A pendulum hanging still",
  "voice-warm": "A guitar by a fireplace",
  "voice-bright": "A wind chime in morning sun",
} as const;

export type PickArtId = keyof typeof PICK_ART;

export const PICK_ART_IDS = Object.keys(PICK_ART) as PickArtId[];

/** URL of the picture for a picker choice. */
export function pickArt(id: PickArtId): string {
  return `/studio/o/${id}.webp`;
}

/** Short description of the picture, for alt text. */
export function pickArtAlt(id: PickArtId): string {
  return PICK_ART[id];
}
