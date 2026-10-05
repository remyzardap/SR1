# Sutaeru design brief

Handoff for the frontend design pass. Everything here was read from the code at commit `2d4b480` (Oct 3, 2026) and from the Moda canvas "Sutaeru Mobile". Nothing was run in a browser, so verify spacing and motion on a device.

## Standard (do not lower)

- Every element is neatly proportioned: consistent radii, gutters and optical alignment, no near-miss spacing.
- Art touches are elegant and restrained. They carry meaning (progress, selection, state), never decoration for its own sake.
- Details are highly refined: icon weights match, labels sit on the grid, empty, loading, error and done states are all designed.
- Interaction is considered: every button and touch point works, gives feedback, and respects reduced motion.
- No generic or off-brand icons. The twin-lens mark belongs to the logo only (see open decisions).
- No helmet or robot background art. That direction is dropped.

## Brand kit

Source of truth: `client/src/styles/reskin-tokens.css` (`--r-*` tokens). Legacy names (`--art-*`, `--sk-*`, `--neon-*`, shadcn) are aliased onto them at the bottom of that file.

| Token | Light | Dark |
|---|---|---|
| paper (background) | `#F7F6F2` | `#1C1B19` |
| panel | `#EFEDE7` | `#2A2926` |
| card | `#FFFFFF` | `#2A2926` |
| stroke | `#E3E1DB` | `#3A3935` |
| ink (text) | `#242320` | `#F7F6F2` |
| quiet (secondary text) | `#66645F` | `#B6BBC3` |
| rule | `#B6BBC3` | `#66645F` |
| accent (orange, "live") | `#F4511E` | `#F4511E` |
| accent-ink (on accent fill) | `#242320` | `#1C1B19` |
| accent-tint | `#FCE9DE` | `rgba(244,81,30,.16)` |
| alert | `#B3402A` | `#B3402A` |
| hero (always-dark blocks) | `#242320` | `#131211` |

Light values are marked final in the file. Dark values are marked "proposals from the design spec".

Theme selection: an explicit `data-mode` / `data-theme` attribute or `light` / `dark` class on an ancestor wins; otherwise the OS `prefers-color-scheme` decides.

Type (loaded in `client/index.html`):
- Titles: Inter Tight. Tracking -2px at 42px, -1.2px at 30px.
- Body: Inter.
- Labels: JetBrains Mono, uppercase, 11px minimum, 1.54px tracking.

Shape and spacing:
- Card radius 24px; large card and panel 28px; thumbnail 18px; pill 999px.
- Chat bubble radius `26px 26px 8px 26px` (tail on the sending side).
- Gutter 20px, card gap 12px, card padding 24px.

Motion: `--r-motion` is 380ms with `--r-ease-out` (`cubic-bezier(.16,1,.3,1)`). It becomes 0ms under the OS reduced-motion setting or `data-reduce-motion="true"`.

Surface: `body::before` carries two soft radial washes and `body::after` a fractal-noise grain (opacity 0.035 light, 0.02 dark). The `data-bg-art="off"` setting hides both.

Orange rule from the Moda designs: orange means live.

## Art vocabulary

Components live in `client/src/components/art/` (`art.css` holds the styles).

| Piece | What it is | Used on |
|---|---|---|
| ConvergeBar | Two ink pills grow from both edges and meet in the middle; gradient trails, dither dots, dotted track; done = middle notch, error = alert break; mono status label and "ABOUT N S LEFT" | Images, Documents, Landing |
| LinearDitherBar | One ink pill left to right with trail and dither head; "STEP 2 OF 4" | Files |
| HalftoneRamp | Dot columns with growing radius on a 12px grid; static corner accent, or a pending-image panel whose dots clear left to right with progress | Landing, Memories, Connections, offline banner, Images |
| FocusBrackets | Four 9px corner strokes, 6px outside a card, marking the active item; ink or alert | Images, Files |
| SteppedMeter | Rounded segments (row 9x8, column 10x22; 10 or 20 segments) | Files storage, Admin, Monitors |
| Chip | Filter pill; active = ink fill | Memories, Files, Images |
| Toggle | 52x30 switch with paper knob | Memories, Settings |
| Header crosshairs | Two small crosshairs at the top corners, (12,12) and (364,12) | Mobile AppHeader |
| Mono labels (`art-mono`) | Uppercase JetBrains Mono status words and readouts | Everywhere |

Mobile chrome (`client/src/styles/chrome.css`): 94px sticky header with logo, mono label and 44px ink avatar; floating collapsible tab bar with safe-area clearance. Desktop keeps the sidebar.

## PWA

- Manifest (`client/public/manifest.webmanifest`): name "Sutaeru", standalone, portrait, scope `/`, background and theme colour `#242320`; icons 192, 512 and maskable 512; shortcuts for Chat and Files.
- `client/index.html`: `viewport-fit=cover`, apple-mobile-web-app-capable, black-translucent status bar, `theme-color` `#F7F6F2` swapped at runtime by an inline script.
- Service worker (`client/public/sw.js`, v2): network-first with cache fallback; skips `/api` and `/trpc`; handles push and notification clicks. There is no offline app shell.
- Safe areas: header, tab bar and bottom clearance use `env(safe-area-inset-*)`.

## Screen status

Design source: Moda canvas "Sutaeru Mobile" (page names match the screens below).

- Images (engine, prompt, generating, done, failed): code matches the Moda pages closely. The "Edit in Atelier" button and the "STUDIO" header label were not found in `Images.tsx`; confirm.
- Landing: hero matches Moda page "Landing" (pill, halftone, headline, session card). Differences: the code adds a features grid and closing band that the mobile design does not have; the secondary button reads "Watch it work" in code and "Watch it" in the design.
- Tab bar: the Moda screens show Chat, Atelier, Generate, Files, More. The latest commit moved Generate into More and made the bar four tabs. Confirm which is intended.
- Not yet designed in Moda (per earlier work): Atelier, dark-mode dashboard variants, mobile dashboard layouts.

## Open issues and decisions

1. `client/public/logo.svg` is still the old tree-canopy drawing; the app icons, favicon and header use the torii-gate twin-lens mark. Replace it or remove it.
2. Manifest `theme_color` is `#242320` while `index.html` uses `#F7F6F2`. Decide one rule (light value, dark value, or per-theme) and apply it to both.
3. Dark values in `reskin-tokens.css` are still proposals. Finalize them.
4. `EngineMark` in `Images.tsx` draws the Gemini badge as two overlapping circles, close to the twin-lens shape. The Moda Images screen shows the same badge, so decide whether the rule "twin-lens is logo only" applies here.
5. `client/src/lib/design.ts` still holds the older Opera Neon palette and grey constants (`AMBER = #8B8B8B`); `PLAN.md` still lists the older mocha/amber palette and DM Serif fonts. Retire or update them so there is one palette.
6. `client/landing/FigureEffects.jsx` is an older canvas "OrbitalSystem" built on circles. Check whether anything still imports it; remove if unused.
7. The Landing features grid is the area flagged earlier as below the standard for icons and animation. It is the highest-value place to apply the standard above.
8. No offline app shell in the service worker.
