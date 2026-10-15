# Handoff to Claude Code: Quiet frontend redo

Written 2026-10-15 from a Claude (claude.ai) planning session with the owner (Rz). You are picking this up on the VPS. Read this file, then `docs/spec/FRONTEND-QUIET.md` (the plan), `docs/spec/FRONTEND-REDO.md` (the rules from the previous redo) and `docs/spec/AGENT_OPS.md` (who does what). This file says where things stand and what to do next.

## Goal

Replace the current look of the React frontend (`client/`) with the new "Sutaeru Quiet" design, screen by screen, and delete the old code each new screen replaces. The data layer (tRPC, auth hooks, SSE, `server/`) does not change.

The new design is 12 phone boards (390x844) in `design/sutaeru-quiet/` as `.dc.html` files (HTML with inline styles; ignore the `{{...}}` holes and `<sc-for>`; layout of the boards is in `canvas.json`). Boards: Home (`Main`), Home light (`HomeDark`, which imports `Main` with `theme="light"`), Menu, Chat (`Answer`), Voice, Agent working (`Session`), Agent done (`Result`), Studio, Docs, Video, Files, You.

## Decisions by the owner (final)

1. Navigation: keep the logo menu sheet AND add the Home mode-card row (Chat, Agent, Studio, Docs, Video, Files). Both stay.
2. Theme: the OS setting decides (`prefers-color-scheme`). An explicit `data-theme` / `data-mode` still wins. The canvas defaults to dark only because it is a mock.
3. Pages with no new board (sign-in, onboarding, Admin, Invites, Audit logs, Memories, Monitors, Skills, Connections, Build, Landing, reset/verify): restyle to match the new system using tokens and shared components. No new layouts.

## What exists right now

- PR #171 (merged into `develop`): the Quiet canvas files, the plan (`docs/spec/FRONTEND-QUIET.md`).
- Issue #172: "Quiet redo: Home and Menu".
- Task `T-172` was dispatched (or is about to be) to the `agy` agent on the VPS: `dispatch.sh task agy T-172 quiet-home-menu "Quiet: Home and Menu" ~/quiet-home-menu.md`. Its instructions file is at `~agents/quiet-home-menu.md`; the log is `~agents/agent-logs/T-172.out`. When it finishes it opens a PR into `develop` on a branch named `wp/T-172-quiet-home-menu`. At the time of writing no PR existed yet.
- The `pre-quiet` rollback tag could NOT be created from the cloud session. Create it: `git tag pre-quiet fe72c48 && git push origin pre-quiet` (`fe72c48` is main on 2026-10-11, the last commit before this work).

## Do these next, in order

1. **Check T-172.** Read `~agents/agent-logs/T-172.out`. If the run failed or stalled, say why (the dispatcher's gate is `npm run check` + `npm test` + a forbidden-path scan) and re-dispatch or use `dispatch.sh push agy T-172`. Do not push anything that did not pass the gate.
2. **Resolve the clash with PR #170** ("Logo menu: one swipeable paper card per mode", branch `feat/menu-card-carousel`, open since 2026-10-11). It changes the same logo menu as T-172. Ask the owner whether to merge or close #170 first; do not merge it on your own.
3. **Review the T-172 PR** against `design/sutaeru-quiet/Main.dc.html`, `HomeDark.dc.html` and `Menu.dc.html`, and against the "Definition of done" in `FRONTEND-QUIET.md`. You review; you never review code you wrote. Verdict: APPROVE, CHANGES REQUESTED or REJECT. Send changes back with `dispatch.sh fix agy T-172`. The owner merges.
4. **Phase 1 (verify the old-to-new map).** The map in `FRONTEND-QUIET.md` was made from board names only. Read the Docs, You and Voice boards in full and correct the map: what "You" really covers (Settings? Identity?), and whether Voice has backend support (`server/` voice routes, Whisper / Gemini Live / ElevenLabs per the owner's stack). Commit the corrections to `FRONTEND-QUIET.md` via a PR.
5. **Plan the rest of Phase 3.** Order: Files, Studio, Docs, Video, Agent working/done, You, Chat (last, highest risk), Voice if supported. One task per screen, each its own issue (`T-<issue>`), each with an instructions file like `quiet-home-menu.md`. Show the owner the list before dispatching more than one at a time.
6. **Phase 4 and 5** (uncovered pages restyle, cleanup) only after the screens are done. Do not delete the old canvases (`design/sutaeru-canvas`, `design/sutaeru-app`) before Phase 5.

## Who does what (from `AGENT_OPS.md`)

- `agy` (Antigravity CLI): frontend and UI, browser checks. Builds screens and CSS in the design lab; screenshots them against the canvas.
- `qwen` (Qwen Code): long, spec-literal work across many files. Container wiring to real data, chrome test updates, deleting replaced code, restyling the uncovered pages, PWA precache check.
- `kimi`, `opencode`: overflow implementers, same dispatcher.
- You (Claude Code): dispatcher and reviewer. Never approve a PR whose code you wrote.
- Owner: merges and deploys. `develop` to `main` is theirs.
- Chat is high-risk: have the other CLI do a read-only review first (`dispatch.sh review <agent> <T-ID>`), then you review.
- **BytePlus is unresolved.** The owner mentioned a "byteplus" agent. It is not in `AGENT_OPS.md`; the only BytePlus mention in code is image generation (`server/lib/fnImage.ts`). Ask the owner what it is. If it is a coding model with a CLI, it would be an overflow implementer for the uncovered-page restyles and `dispatch.sh` would need a small change to launch it. If it is the image/video model, it supplies pictures for Studio and Video, not UI code.

## Rules that must hold

- Presentational component (props in, no fetching) plus a container. Lab routes at `/__lab` with fixtures in `client/src/lab/fixtures/`; the production build must contain no lab code.
- Do not touch `server/`, migrations, `.env*`, `secrets/`, `.github/workflows/deploy.yml`, `ops/session-manager/` (the dispatcher's forbidden paths).
- No new dependencies beyond what `FRONTEND-REDO.md` allows. Self-hosted fonts, no CDN, no runtime external requests.
- Delete an old component and its CSS (in `client/src/styles/redo`) in the same PR as its replacement, only when the tests pass and nothing else imports it. Update the chrome tests (`shell.test`, `logo-menu.test`) deliberately; never delete them to get green.
- Behavior must not regress: chat streaming, approvals, citations, PWA update flow, auth, invites, first run. Check the service worker precache list on every PR.
- Respect reduced motion, 44px tap targets, visible keyboard focus, 4.5:1 text contrast, both themes, widths 360 / 390 / 1280.
- Every PR body: what was ported, what was polished beyond the canvas, anything NOT RUN.

## Known gaps and unverified items

- The canvas images are `/_blob/<id>` references and were NOT exported with the files. Screens that use them need photos from `client/public/studio/` or an export from the canvas. This is unverified: the old canvas README said its blobs map to `client/public/studio/`; the Quiet canvas may use the same photos or different ones.
- The old-to-new map is provisional (see step 4).
- Nothing in the cloud session was run in a browser or built: no `npm install`, no tests, no screenshots. Treat all claims about how the screens look as unchecked.
- The token diff between the Quiet canvas and `client/src/styles/reskin-tokens.css` has not been done. From what was read, the palette (`#F7F6F2` paper, `#242320` ink, `#F4511E` accent) and the fonts (Inter Tight, Inter, JetBrains Mono) match; the canvas also uses a dark hero `#131211`. Verify.
- Whether `~agents/sr1` exists and whether `dispatch.sh` is at `~agents/sr1/ops/agents/dispatch.sh` was assumed from the script's defaults, not checked.
