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

## Design decisions

- **Orange only means live**: running dots, the progress dial, the next stepped bar, the live-preview tag. Buttons are ink.
- **Art only carries meaning**:
  - Halftone ramp: Sutaeru is listening.
  - Converge and sweep bars: progress.
  - Focus brackets: the chosen or currently read item.
  - Ink sphere: a background job filling up.
  - Dither: something being drawn or written.
  - Crosshairs: registration marks only.
- **The studio's preview is a parametric sketch** (`scene.js`), not a photo. It shows framing, perspective, depth of field, light direction and style before any credits are spent. The real engine still draws the final image; the page says so.
- **Engine previews come from the same renderer**, set to what each engine is best at (Gemini clean type, OpenAI cinematic light, Wan close natural detail).
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
