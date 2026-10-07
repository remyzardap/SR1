# Frontend redo: port the design prototype

**Owner decision (2026-10-07):** the prototype in `design/sutaeru-app/` is the direction. Every screen of the React app must look and move like it, only more polished. Nothing else about the frontend is authoritative. Backend work is paused until this is finished.

## Source of truth

- Run the prototype to see it: `cd design/sutaeru-app && python3 -m http.server 8080`, open `http://localhost:8080/#home`. Hash routes: `#home #answer #agent #studio #image #session #done #files #settings`.
- Read `design/sutaeru-app/NOTES.md` first (brand, photography, documents, motion rules). The CSS is `app.css`, the behaviour is `app.js`, `scene.js`, `photo.js`, `docs.js`, `brand.js`, `pwa.js`.
- **Port, do not reinterpret.** Copy the prototype's markup structure, class names where practical, CSS rules, spacing, type scale, colours, radii, easing and timings. When the prototype and your taste disagree, the prototype wins. "More polished" means: fix rough edges the prototype still has (alignment, truncation, focus states, loading and empty states, press states, keyboard, contrast, reduced motion, 360 px widths), not a different look.
- Tokens: `--paper --panel --card --stroke --ink --quiet --rule --accent --accent-tint --alert`, fonts Inter Tight (display), Inter (body), JetBrains Mono (labels), light and dark. They already exist in `client/src/styles/reskin-tokens.css`; make them match `app.css :root` exactly.

## Architecture rules

1. Every screen = a **presentational component** (props in, no data fetching) + a **container** that feeds it real data from the existing hooks/tRPC/SSE. Behaviour must not regress: chat streaming, approvals, citations, PWA update flow, invite/first-run screens, auth.
2. **Design lab.** Route `/__lab` (index) and `/__lab/<screen>` render each presentational component with **sample fixtures** (copy the prototype's sample data), no login, no network. Query params: `?theme=light|dark`, `?state=<name>` for states (empty, streaming, error, stopped, ...), `?w=360|390|430` is just the browser width. The lab is compiled in only when `import.meta.env.DEV` or `VITE_DESIGN_LAB === "1"`; the production build must contain no lab code or fixtures (check `dist/`).
3. Fixtures live in `client/src/lab/fixtures/`, one file per screen. Photos and documents from the prototype go to `client/public/studio/` (WebP only, keep the three sizes the prototype uses) and are never part of the PWA precache.
4. Dependencies: nothing new except self-hosted fonts (`@fontsource/inter-tight`, `@fontsource/inter`, `@fontsource/jetbrains-mono`) and libraries already in `package.json` (`motion`, `framer-motion`, `vaul`, `sonner`, `lucide-react`, Radix). No CDN, no external requests at runtime.
5. Respect `prefers-reduced-motion` everywhere (the prototype's intro is skipped, dithers become static, transitions go instant). Everything keyboard reachable with a visible focus bracket/ring; every icon button has an accessible name; text contrast 4.5:1 minimum in both themes; tap targets 44 px.
6. Navigation is the logo at top left opening a sheet. **There is no bottom bar.**
7. Do not touch `server/`, migrations, or anything outside `client/`, `shared/` types if needed, and docs.

## Screens and where they live

| Prototype | React screen | Route |
|---|---|---|
| `#home` | Chat home: mark, wordmark, tagline, halftone ramp, "Recently updated", hand-off card, composer | `/chat` (empty) |
| `#answer` | Chat answer: sources landing, streaming answer, chart, citations, "Turn this into" | `/chat` (conversation) |
| `#agent` | Agent task builder: six output types, depth/sources, "Sutaeru will" plan | `/chat` agent mode |
| `#studio` | Image studio: shot, angle, lens, light, look, shape tiles | `/images` |
| `#image` | Image run: dither reveal, converge bar, phases, cancel, variants | `/images` (running) |
| `#session` | Agent session: stipple dial, step flow, draft rows, stop and resume | agent session view |
| `#done` | Result: dark result card, figures, actions, comparison, 済 stamp | result card |
| `#files` | Files: storage meter, search, filters, document minis, empty states | `/files` |
| `#settings` | Settings: theme, background art, reduce motion, art intensity, voice | `/settings` |
| (extras) | Public landing, login, onboarding/first run, offline, install card, splash/intro, People/invites, approval cards, admin pages: restyle to the same system | existing routes |

## Definition of done (every screen job)

- Lab route for each state in the prototype, light and dark, at 360, 390 and 1280 px.
- Reviewer (Claude) screenshots the lab page and the prototype and compares them. Visible differences = changes requested. Make the lab page match the prototype first, then polish.
- `npm run check`, `npm test` and `npm run build` pass; production bundle contains no lab code.
- Behaviour preserved: the container still works with real data (existing tests keep passing; add tests for new logic).
- PR body: what was ported, what was polished beyond the prototype, and anything NOT RUN.

## Art touches: considered, quiet, blended (owner direction 2026-10-07)

The small art pieces (halftone dots, dither edges, registration marks, focus brackets, grain) must be refined and considerate: they belong to the paper and fade into it. Nothing may end in a hard edge or sit on top of the surface like a sticker. The reference design canvas was built to these recipes; match them, then polish further.

1. **Paper grain.** One overlay per screen: an inline SVG `feTurbulence` (fractalNoise, baseFrequency .8, 2 octaves, stitchTiles) through a greyscale `feColorMatrix`, `mix-blend-mode: overlay`, opacity .09, pointer-events none, above content. Works in light and dark without tokens. Off under the "Background art" setting; scaled by "Art intensity".
2. **Dot ramp** (under the tagline): 27 dots, size `1.6 + 11.4 * sin(pi*i/26)^1.7` px, opacity `0.10 + 0.78 * sin(...)^1.1`, gap 6 px. Both ends fade to almost nothing. It reacts to typing by shifting its peak, never by popping.
3. **Dither and halftone edges** are graded, never a single hard band. Build with stacked `radial-gradient` dot layers of increasing dot size (about 1.1, 2, 3 px on 5/6/7 px grids) each with a `mask-image: linear-gradient(90deg, transparent, #000 ...)` so density rises smoothly, then a solid area with a faint dot texture that itself fades in. Examples: the image-run reveal (fine to coarse into paper, a 1.5 px accent scan line with a soft vertical fade and a 22 px warm glow on its trailing side), the result card corner (two radial-masked layers, fine 5 px grid at .42 opacity plus a coarse 9 px grid at .5 near the corner), the settings sample (fine plus coarse layers, top and bottom faded into the card), the hand-off card (a 130 px wide 6 px-grid halftone at .2 opacity masked transparent at both ends, behind the content, no separate dot matrix).
4. **Registration marks** (the two "+" under the header): 11 px, 1 px lines in `--rule` at .45 opacity, inset 16 px.
5. **Focus brackets**: 10 to 13 px legs, 1.5 px stroke in `--ink` at .55 opacity, `border-radius` 5 to 6 px on the outer corner only, 6 to 9 px outside the element, decorative (`aria-hidden`, pointer-events none). On real focus they snap in over 120 ms; under reduced motion they appear without animation.
6. **Everything blends**: no art element may have a visible rectangular boundary. If one does, add a mask or a gradient fade. Check every lab screenshot at 2x for hard edges, banding and moire.
7. **Card finish**: hairline top highlight (`inset 0 1px 0 rgba(255,255,255,.7)` in light, `.04` in dark) plus the layered shadow from the tokens.
