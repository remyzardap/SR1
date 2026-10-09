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
  "nav-images": "A vintage camera beside a paint palette",
  "nav-documents": "A tall stack of paper under a desk lamp",
  "nav-files": "An open filing drawer of folders",
  "nav-video": "A film reel in a projector beam",

  /* Depth */
  "depth-quick": "A pebble skipping across a calm lake at dusk",
  "depth-standard": "Sunlight reaching down into clear green water",
  "depth-deep": "A spiral staircase descending into the dark",

  /* Tone */
  "tone-confident": "A chess king standing in a pool of light",
  "tone-friendly": "Two mugs of cocoa clinking together",
  "tone-formal": "A long, orderly boardroom table",
  "tone-plain": "A plain white bowl and a wooden spoon",

  /* Length */
  "len-medium": "Two sheets of handwritten letter on a desk",
  "len-long": "A thick manuscript tied with twine",

  /* Style */
  "style-keep": "An old book preserved under a glass dome",
  "style-modern": "A clean desk with a slim laptop and a plant",
  "style-classic": "A writing desk with inkwell, quill and wax seal",

  /* Theme */
  "theme-dark": "A phone on a desk at night by a small lamp",
  "theme-light": "A phone on a desk in bright morning light",
  "theme-auto": "A phone on a desk at dusk, half light and half shadow",

  /* Motion */
  "motion-full": "Light trails swirling around a hanging mobile",

  /* Not yet generated (Vertex rate limits): len-short, motion-reduced,
   * voice-warm, voice-bright, reformat-before, reformat-after. Add the webp to
   * public/studio/o/ and its id here. */
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
