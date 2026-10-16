# T-183 Progress — Quiet: Agent working and done

## Done
- Read `docs/spec/HANDOVER.md`, `docs/spec/README.md`, `docs/spec/FRONTEND-QUIET.md`, `docs/spec/FRONTEND-REDO.md`, `docs/spec/AGENT_OPS.md`, `design/sutaeru-quiet/README.md`, and `/home/agents/agent-logs/T-183.task.md`.
- Analyzed `design/sutaeru-quiet/Session.dc.html` and `design/sutaeru-quiet/Result.dc.html`.
- Audited existing agent/session/result code (`SessionView.tsx`, `SessionContainer.tsx`, `ResultCard.tsx`, `DoneContainer.tsx`, `AgentBuilder.tsx`, `Chat.tsx`, `LabSession.tsx`, `LabDone.tsx`, `session.css`, `done.css`).
- Verified exact mathematical formulas for the 60-dot progress ring + orange gauge needles and the 5x7 dot-matrix SVG glyph renderer against `Session.dc.html` and `Result.dc.html` (100% byte-identical circle and line coordinates).

## In progress
- Adding missing Quiet tokens (`--glass`, `--hi`, `--r-glass`, `--r-hi`) to `client/src/styles/reskin-tokens.css`.
- Creating shared 5x7 dot-matrix SVG component and porting `SessionView.tsx` and `ResultCard.tsx` to the Quiet canvas.

## Next
- Update `SessionContainer.tsx`, `DoneContainer.tsx`, and wire `/chat?mode=agent` in `Chat.tsx` so agent runs show `SessionView` while working (preserving approvals and SSE streaming) and `ResultCard` when done.
- Update `client/src/styles/redo/session.css` and `client/src/styles/redo/done.css` (preserving `.result` for `redo.test.ts`).
- Update `LabSession.tsx`, `LabDone.tsx`, `LabRouter.tsx`, `client/src/lab/fixtures/session.ts`, and `client/src/lab/fixtures/done.ts` (supporting light/dark and 360/390/1280 widths).
- Write comprehensive unit tests (`client/src/components/session/session.test.ts` and `client/src/components/done/done.test.ts`) covering all states and failure paths.
- Run `npm run check`, `npm test`, `npm run build` and write `/home/agents/agent-logs/T-183.pr.md`.

## Decisions
- **Phase 1 board mapping**:
  - `Session.dc.html` ("Agent, working") maps to `client/src/components/session/SessionView.tsx` + `SessionContainer.tsx`, lab route `/__lab/session` (plus alias `/__lab/agent-working`), and active agent runs started from `/chat?mode=agent`.
  - `Result.dc.html` ("Agent, done") maps to `client/src/components/done/ResultCard.tsx` + `DoneContainer.tsx`, lab route `/__lab/done` (plus aliases `/__lab/result`, `/__lab/agent-done`), and completed agent runs in `/chat?mode=agent`.
- **Studio photos mapping for `Result.dc.html` (`/_blob/864739a32ff25921ef07f286e4414e59`)**:
  - `report`: `/studio/c/cov-solar.webp`
  - `deck`: `/studio/c/cov-jakarta-bw.webp`
  - `sheet`: `/studio/c/cov-villa.webp`
  - `brief`: `/studio/c/cov-village.webp`
  - `monitor`: `/studio/c/cov-pylons.webp`
  - `image`: `/studio/c/cov-clay.webp`
- **CSS retention**: Keep `.result` in `client/src/styles/redo/done.css` because `client/src/styles/redo.test.ts` asserts `.result` is present and all `@import`s in `redo/index.css` are non-empty.

## Commands to verify
- `npm run check`
- `npm test`
- `npm run build`
