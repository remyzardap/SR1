# Lovable <-> Claude Code handoff

Shared meeting point for the two agents working on this repo (`remyzardap/SR1`, branch `main`).
Lovable owns UI. Claude Code owns backend, build, deploy and the VPS. Both read this file before working and append to the log at the bottom when done.

## Repo rules (both sides)

- Client source lives in `client/src/` (the `@` alias points there). Never write to `src/`.
- Package manager is **npm** only. Commit `package.json` and `package-lock.json`; do not add `bun.lock`.
- Files must be committed as decoded source, never base64 blobs. A past sync wrote raw base64 into 33 files.
- New npm imports must be added to `package.json` in the same push, or the VPS build fails.
- `ai-elements` components go in `client/src/components/ai-elements/`.
- Backend (`server/`), `drizzle/`, `Dockerfile`, `docker-compose.yml` and `.github/` are Claude Code's. Lovable: do not edit them; ask below instead.
- Icons: match Sutaeru's organic look. No sparkle, wand, brain or robot icons.
- Every push to `main` auto-deploys to the VPS (brief downtime). Keep pushes meaningful; docs-only commits should include `[skip ci]`.

## Shared workspace and sync

`/opt/sutaeru-lovable` on the VPS is the shared workspace. Lovable edits there; Claude Code works in `/root/sr1` (git). `scripts/lovable-sync.sh` moves code between them:

- `status`: what differs, split by owner.
- `to-lovable [--client]`: repo to workspace. Backend, docs and config always; `client/` only with `--client`.
- `from-lovable`: workspace to repo. `client/`, `package.json`, `package-lock.json` and this doc. Must be run on a branch, never on `main`.

Ownership: Lovable owns `client/`. Claude Code owns everything else. Secrets and `.env` never travel (only git-tracked files go to the workspace).

Two directions, same loop:
1. Lovable builds a feature (UI or add-on): Claude Code runs `from-lovable`, builds, wires or adds any backend it needs, commits, then `to-lovable` so the workspace is current.
2. Claude Code builds a backend feature: `to-lovable`, then Lovable wires it into `client/` and logs it below. Claude Code then runs `from-lovable`, builds, commits.
3. Whoever needs something from the other writes it under the "Requests" headings above. Never edit the other side's files directly.
4. Merging to `main` (which deploys) is Claude Code's step and needs Remy's go-ahead.

## Requests for Lovable (Claude Code writes here)

- Restyle `client/src/components/AgentSkillsPanel.tsx` (owner-only panel on the Skills page: list of skill folders with Review, Turn on/off, and a report). Functional and unstyled beyond existing tokens; keep the tRPC calls (`kemma.agentSkills`, `kemma.reviewAgentSkill`, `kemma.setAgentSkillEnabled`) as they are. No sparkle/wand/brain/robot icons.

- Wire the Lovable-designed screens to the real backend. The backend is tRPC (types via `AppRouter` from `server/routers.ts`; routers in `server/routers/` and `server/kemma/`). Go screen by screen (chat and threads, Deep Research, Review panel, exports, Skills page, connectors/settings): replace mock or static data with tRPC hooks (`trpc.<router>.<procedure>.useQuery/useMutation`), add loading, empty and error states, and keep existing procedure names and inputs as they are. If a screen needs a procedure that does not exist, do not invent one: write it under "Requests for Claude Code" with the exact input and output shape you want. Do not touch `server/`. Connectors are server-side config (`mcp.config.json`); the UI should only show status, not tokens.

## Requests for Claude Code (Lovable writes here)

_None open._

## Log (newest first; date, who, what)

- 2026-09-29 Claude Code: PWA wired (manifest link, service worker registration). Lovable: no action needed; do not remove `client/public/manifest.webmanifest` or `sw.js`.
- 2026-09-29 Claude Code: repaired base64-corrupted files from Lovable sync, added missing deps. Build now passes with `npm run build`.
