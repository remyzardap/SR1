# Sutaeru app prototype

An interactive, installable (PWA) prototype of the Sutaeru frontend. Plain HTML, CSS and JS with no build step. Open `index.html` through any static server (for example `python3 -m http.server` in this folder), or install it to a phone home screen.

It is a design reference for the React app in `client/`, not production code. Every screen runs on sample data.

## Sources it follows

- **Moda brand kit "Sutaeru"** (read through the Moda connector): Paper, Panel, Card, Ink, Quiet, Rule, Accent, Alert; Inter Tight, Inter, JetBrains Mono.
- **Moda canvas "Sutaeru Mobile"** (23 pages), especially the newest page, "Home (Perplexity-style reskin)": centered twin-lens mark, 53px wordmark, mono tagline, a 16-dot halftone ramp, "Recently updated", the dark "Hand off a project" card and a composer with Thinking, private and voice controls.
- **`client/src/styles/reskin-tokens.css`** for token names and values, and `SutaeruIcon` / `SutaeruGlyph` for the icon set and logo (copied, not redrawn).
- **Claude Design boards** (Sessions, Working, Done, New session, Desktop, Art options, Motion storyboard, Loading bars) for the art vocabulary and the motion rules.
- **Spec v3** (chat / agent boards) and the frontend design brief.

## Screens

| Hash | Screen | What to try |
|---|---|---|
| `#home` | Chat home | Type and watch the dot ramp react; `+` adds a file with an upload bar; Thinking, Sources and Private toggles; the voice button fills a sample question |
| `#answer` | Chat answer | Sources land one by one, the answer streams, the chart draws in. Tap a citation to bracket its source. "Turn this into" hands the answer to Agent |
| `#agent` | Agent task builder | Six output types with drawn previews. Depth, sources and type all redraw the "Sutaeru will" plan, time and cost |
| `#studio` | Image studio | Shot, camera angle, lens, light, look and shape. Every tile is a live render of that choice. Quoted words in the prompt print on the mug and switch the suggested engine |
| `#image` | Image run | Dither covers the picture and clears left to right; converge bar, phases and ETA; Cancel, stopped state, variants and "try another engine" |
| `#session` | Agent session | Stippled progress dial, step flow with sources counter and page tracker, draft rows that resolve, ink sphere hand-off card, in-page stop confirmation and Resume |
| `#done` | Result | Dark result card with a dither edge, key figures, actions, comparison table |
| `#files` | Files | Storage meter, search, filters, live "writing" file, designed empty state (try Videos) |
| `#settings` | Settings | Theme (light, dark, system) with previews, background art, reduce motion, art intensity with a live sample, voice sliders that rewrite a sample answer |

Navigation is the logo at top left, which opens a sheet. There is no bottom bar.

## Brand mark (brand.js)

- **Loop unchanged.** The twin-lens loop keeps its path and 9-unit stroke.
- **The right lens now holds a Myōjin torii** with a curved, upswept kasagi, the shimaki under it, a gakuzuka plaque strut, a nuki that runs past the posts, and posts that lean slightly inward.
- **The sun rises through the gate,** below the nuki.
  - It is a plain hinomaru disc.
  - It has no rays, so it stays clear of the Rising Sun flag.
- **Large sizes add a sea horizon** (the floating torii at Itsukushima). The sun's reflection breaks the horizon in orange.
- **The left lens stays empty on purpose (*ma*).**
- **Two levels of detail.** `glyph({ detail: "full" })` is for the hero, the splash and the app icon. `glyph({ detail: "compact" })` is for 48 px and below.
- **Name seal (rakkan).** It reads スタエル in Shippori Mincho, set right column first, with the characters cut out of a vermilion square. It sits beside the wordmark and in the nav.
- **済 settled stamp.** It is pressed onto finished work: the result card, the session "ready" banner and a finished image.
- **Kana as paths.** The kana are converted to SVG paths (opentype.js), so the marks never depend on a Japanese font being installed.
- **Intro on first visit.** The loop draws, the gate settles, the sun rises out of the sea and the seal is pressed. Reduced motion skips it.
- **Regenerated icons.** `icons/` holds new app icons and a favicon made from the new mark.

## Photography (photo.js)

- **Studio previews use real photographs from Unsplash.** They are free under the Unsplash License, and Unsplash+ photos were excluded. Files are in `img/t` (480 px) and `img/l` (1280 px), WebP.
- **Camera angle picks the photograph.** Overhead, high and low each have their own. Eye level uses the light's photograph, and tilted rotates it.
- **Light picks the photograph at eye level, and grades the angle photographs.** The grades are warm golden, dark with a lamp pool for night, lifted studio, glow for backlit, and cool window.
- **Shot and lens zoom toward the cup.** Each photograph carries a measured focal point, plus a rim point for Detail. Long lenses blur the edges like shallow depth of field.
- **Shape crops, and film adds real grain, fade and vignette.**
- **Ink and dots prints the framed photograph as a halftone** (canvas, auto levels, S curve). Illustration and Clay use the drawn renderer.
- **Every option tile is the current picture with that one choice changed.**
- **A Photo / Sketch switch** on the viewfinder keeps the exact composition drawing available.
- **Credits.** The photographer shows under the viewfinder, and the full list is in "Sample photos · Unsplash" at the end of the studio.

Photographers: Thomas Park, Barney Goodman, Giorgio Trovato, René Porter, Olena Bohovyk, Debby Hudson, Erik Witsoe, Zach Lezniewicz, Thabet Studio, engin akyurt, Charmil Gandhi, tabitha turner, Jei Lee, Daniel Dan, Monaz Nazary, Tim Foster, Jocelyn Morales, Luca Massimilian, Martyn Yakub, John Forson, Brett Jordan, pariwat pannium, Danielle-Claude Bélanger. Photo ids are in `photo.js`.

## Design decisions

- **Orange only means live**: running dots, the progress dial, the next stepped bar, the live-preview tag. Buttons are ink.
- **Art only carries meaning**:
  - Halftone ramp: Sutaeru is listening.
  - Converge and sweep bars: progress.
  - Focus brackets: the chosen or currently read item.
  - Ink sphere: a background job filling up.
  - Dither: something being drawn or written.
  - Crosshairs: registration marks only.
- **The studio's preview is real photography, composed live** (`photo.js`), with the parametric sketch (`scene.js`) one tap away. The real engine still draws the final image; the page says so.
- **Engine cards use character photographs** (Gemini graphic lettering, OpenAI cinematic steam, Wan glaze detail) with a small mark for each engine. None of the marks use the twin-lens shape, which belongs to the logo.
- **Mode switch is Chat | Agent**, as in spec v3 and commit `debb6c9`. The Moda page shows "Search | Agent"; pick one.

## Dark theme values used

The brief marks the dark values as proposals. This prototype uses `paper #1C1B19`, `panel #2E2D2A`, `card #252421`, `stroke #3A3935`, `ink #F4F2EC`, `quiet #B6BBC3`, `rule #6B6964`, `seg-off #403F3A`, and alert lifted to `#E0694E` for contrast on dark. Card and panel are split (the proposal had both at `#2A2926`) so cards stay distinct from inset panels.

## Checks run

- Playwright, Chromium: every view at 1440×900 and at 390×844 (touch, DPR 2), plus light and dark.
- `scrollWidth` equals the viewport at 360, 390, 430 and 1440 px on all eight views.
- No console or page errors through a scripted pass: nav sheet, studio picks, image run to done, stop and resume.
- Touch targets measure 44px or more, through padding or an invisible hit area where the visual is smaller (pills, toggles, citation chips).
- `prefers-reduced-motion` and the in-app Reduce motion setting snap every bar, dial and stream to its end state.

## Not built here (still open)

- Memories, Skills, Monitors, Connections and Identity pages. The nav lists them as "Full app".
- Offline state, service worker app shell and Admin.
- Real data. Answers, sessions and files are samples; follow-ups say so on screen.
- Open items from the brief that this prototype does not settle:
  - `client/public/logo.svg` is still the old drawing.
  - The manifest theme colour disagrees with `index.html`.
  - `design.ts` still holds the old palette.
  - `FigureEffects.jsx` may be unused.
