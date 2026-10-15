# Frontend redo 2: port the Quiet canvas

Visual target: `design/sutaeru-quiet/` (supersedes `design/sutaeru-canvas/` and `design/sutaeru-app/` once Phase 5 is done).
Rollback: git tag `pre-quiet` is the last commit before this work. Work happens on `redo/quiet-canvas`, one PR per screen.

## Decisions (owner, 2026-10-15)

1. Navigation: keep the logo menu sheet AND add the Home mode-card row (Chat, Agent, Studio, Docs, Video, Files). Both stay.
2. Theme: the OS setting decides (`prefers-color-scheme`); explicit `data-theme`/`data-mode` still wins. The canvas defaults to dark only because it is a mock.
3. Pages with no new board (sign-in, onboarding, Admin, Invites, Audit logs, Memories, Monitors, Skills, Connections, Build, Landing, reset/verify): restyle to match the new system with tokens and shared components; no new layouts.

## Machinery already in the repo (reuse, do not rebuild)

- Every screen is a presentational component (props in, no fetching) plus a container that feeds it real data from the existing hooks, tRPC and SSE. See `docs/spec/FRONTEND-REDO.md`.
- Design lab: `/__lab` and `/__lab/<screen>` render each presentational component with fixtures from `client/src/lab/fixtures/`, no login, no network. Compiled in only for dev or `VITE_DESIGN_LAB=1`.
- Tokens: `client/src/styles/reskin-tokens.css` (`--r-*`). Same palette and fonts as the Quiet canvas; expect only small diffs.

## Old to new map (provisional, matched by board name; verify when each screen starts)

| Quiet board | Current | Route |
|---|---|---|
| Home | chat empty state | `/chat` |
| Menu | `components/chrome/LogoMenuSheet`, `menuModel` | sheet |
| Chat | `pages/Chat.tsx` answer view (1,144 lines: streaming, approvals, citations) | `/chat` |
| Agent working / done | agent builder, session, result | `/chat?mode=agent` |
| Studio | `pages/Images.tsx` | `/images` |
| Docs | Documents, Generate, Atelier, EditDocument | `/documents` |
| Video | `pages/Video.tsx` | `/video` |
| Files | `pages/Files.tsx` | `/files` |
| You | Settings, Identity | `/settings` |
| Voice | no current screen; check backend support first | tbd |

## Phases

0. Setup: branch, `pre-quiet` tag, canvas files in repo (this commit).
1. Verify the map by reading the Docs, You and Voice boards in full; list gaps.
2. Foundation: diff Quiet tokens against `reskin-tokens.css`; new shell; Home mode-card row beside the logo sheet.
3. Screens, one PR each, in this order: Menu + Home, Files, Studio, Docs, Video, Agent working/done, You, Chat, Voice (if supported). Each PR: lab route with fixtures (light and dark, 360/390/1280), container wired to real data, old component and its CSS in `styles/redo` deleted in the same PR once tests pass and nothing else imports it.
4. Uncovered pages: restyle with tokens and shared components only.
5. Cleanup: delete leftover dead code, `design/sutaeru-canvas`, `design/sutaeru-app`, unused fixtures and CSS; confirm the production bundle has no lab code.

## Definition of done per PR

- `npm run check`, `npm test`, `npm run build` pass.
- Existing behavior preserved (chat streaming, approvals, citations, PWA update flow, auth, invites, first run). Chrome tests (`shell.test`, `logo-menu.test`) updated deliberately, not deleted.
- No new dependencies beyond what FRONTEND-REDO.md allows.
- PR body lists what was ported, what was polished, and anything NOT RUN.

## Risks

- Chat streaming and approvals regressions (largest file, most state).
- Chrome tests are tied to the old menu.
- PWA cache serving stale assets after the swap; check the service worker precache list per PR.
- Quiet images are not exported yet.
