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
