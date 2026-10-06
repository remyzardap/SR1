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

- **Studio previews use real photographs from Unsplash.** They are free under the Unsplash License, and Unsplash+ photos were excluded. Files are WebP in three sizes: `img/t` (480 px), `img/m` (800 px) and `img/l` (1280 px). Each frame loads the tile first, then the smallest size that stays sharp at the device's pixel ratio and the current zoom, so a phone rarely downloads the 1280 px file.
- **Camera angle picks the photograph.** Overhead, high and low each have their own. Eye level uses the light's photograph, and tilted rotates it.
- **Light picks the photograph at eye level, and grades the angle photographs.** The grades are warm golden, dark with a lamp pool for night, lifted studio, glow for backlit, and cool window.
- **Shot and lens zoom toward the cup.** Each photograph carries a measured focal point, plus a rim point for Detail. Long lenses blur the edges like shallow depth of field.
- **Shape crops, and film adds real grain, fade and vignette.**
- **Ink and dots prints the framed photograph as a halftone** (canvas, auto levels, S curve). Painted and Clay show style references (below).
- **Every option tile is the current picture with that one choice changed.**
- **A Photo / Sketch switch** on the viewfinder keeps the exact composition drawing available.
- **Credits.** The photographer shows under the viewfinder, and the full list is in "Sample photos · Unsplash" at the end of the studio.

Photographers: Thomas Park, Barney Goodman, Giorgio Trovato, René Porter, Olena Bohovyk, Debby Hudson, Erik Witsoe, Zach Lezniewicz, Thabet Studio, engin akyurt, Charmil Gandhi, tabitha turner, Jei Lee, Daniel Dan, Monaz Nazary, Tim Foster, Jocelyn Morales, Luca Massimilian, Martyn Yakub, John Forson, Brett Jordan, pariwat pannium, Danielle-Claude Bélanger. Photo ids are in `photo.js`.


## Documents (docs.js)

- **Finished files show as real miniature documents, not icons.** Each is composed on a 560×340 stage and scaled to its box. Short boxes zoom in to fill.
  - Report: fanned A4 pages with a cover photo, key figures and a supplier table.
  - Deck: a 16:9 title slide on a cover photo, with slides behind it.
  - Sheet: a spreadsheet window with real BOQ figures, tabs and a pinned site photo.
  - Brief: a one-page memo with a photo band, two decisions and the seal.
  - Monitor: a live chart card.
- **Used in** Agent output cards, Files, "Turn this into", the agent session draft (which resolves out of dither as work progresses) and the result card. On wide screens the result card shows the document with the 済 stamp pressed on it in vermilion.
- **Pages stay paper-coloured in both themes**, slightly dimmed in dark mode.

## Style references

- **Painted and Clay 3D now show real reference images** instead of drawings: a public-domain watercolour still life (Europeana) and a soft 3D render (BlushStudio Creations).
- **The other tiles keep showing the photo** while one of these looks is chosen, so framing and light stay readable.

## Polish

- Cards have a hairline top highlight and layered shadows.
- On desktop, cards lift slightly on hover and photos zoom gently.
- Focus rings are two-tone, so they stay visible on photos and in dark mode.
- Inter uses its contextual and tabular figures.
- Screens cross-fade with the View Transitions API, and the picture glides from the studio viewfinder into the image-run frame. Browsers without View Transitions fall back to the normal entrance.

Cover and reference photographers: Bernd Dittrich, Bagus Alif Widhiwipati, kadek wahyudi, Ethan Feng, Matthew Henry, Point Normal, Rafli Raihan, Anders J, Europeana, BlushStudio Creations.

## Phone app (PWA)

The prototype is built for the installed phone app first. Desktop gets the same screens with more room.

- **Installs like an app.**
  - The manifest has an id, standalone display, portrait orientation, shortcuts with icons, and three store-style screenshots (`screens/`).
  - Android shows its real install prompt from a card on Home.
  - iPhone Safari gets a three-step Add to Home Screen guide in a sheet. Both can be dismissed for good.
- **Launch.**
  - iPhone splash screens (`splash/`, 12 files) for current screen sizes, in light and dark.
  - The status bar colour follows the theme.
- **Works offline.**
  - `sw.js` precaches the app shell, the photo tiles and the document covers. Navigation is network first, falling back to the cached page.
  - Photos are cache first; scripts, styles and fonts are stale while revalidate.
  - A cold launch with no network still opens Home with past chats and file thumbnails.
  - When the connection drops, a banner says so and the composer reads "Ask now. It sends when you reconnect."
  - A question asked offline sits at the top of Recently updated as "Waiting to send" and goes out on its own when the phone reconnects.
- **Sheets instead of popovers on phones.**
  - Attach, Sources, the nav and the Stop confirmation rise from the bottom with a grab handle.
  - Swipe down, tap outside or press Escape to close.
- **The back gesture behaves.**
  - Opening a sheet or the nav adds a history entry, so Android back (and browser back) closes it instead of leaving the screen.
  - Moving between screens from the nav does not leave dead entries behind.
  - An installed iPhone app has no back button, so a swipe from the left edge goes back, with a small arrow that follows the finger.
- **Keyboard.**
  - The viewport uses `interactive-widget=resizes-content`, and `visualViewport` lifts docked composers above the on-screen keyboard.
  - While typing, the docked Start (Agent) and Begin (Studio) bars step aside so the field stays in view.
- **Touch.**
  - Every target is 44 px or more, with no double-tap zoom delay.
  - Selections give a short vibration where the phone supports it (never on iPhone, which ignores it).
  - Toasts drop in under the header on phones, below the offline banner when it shows, so they never cover the composer.
- **Studio on a phone.** The viewfinder stays pinned while the options scroll under it, and shrinks as you scroll (266 px to 163 px tall) so more tiles fit.
- **Inside the artifact viewer** the page runs in a sandboxed frame, so install, the service worker and the iPhone back swipe stay off there. They work when `index.html` is served over https (or localhost) at the top level.

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
- PWA script at 390×844 (touch): sheets open and close with back, nav back, offline banner, offline queue and auto send on reconnect, stop sheet, collapsing viewfinder, active service worker and a cold offline launch.

## Not built here (still open)

- Memories, Skills, Monitors, Connections and Identity pages. The nav lists them as "Full app".
- Admin.
- Push notifications for finished sessions (needs a backend).
- Real data. Answers, sessions and files are samples; follow-ups say so on screen.
- Open items from the brief that this prototype does not settle:
  - `client/public/logo.svg` is still the old drawing.
  - The manifest theme colour disagrees with `index.html`.
  - `design.ts` still holds the old palette.
  - `FigureEffects.jsx` may be unused.
