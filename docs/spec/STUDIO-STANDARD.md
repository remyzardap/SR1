# Plan: Studio standard for every Sutaeru page (fold everything, maximize screen)

## Context

Remy reviewed the live site on his phone on 2026-10-08. His verdict:

- **The Image Studio is the standard.** He likes how choices are shown as picture cards and likes the full set of options. Every page should follow it.
- **Everything must fold.** Option groups collapse to one line so the screen isn't crowded and the space goes to content. It should feel modern.
- **Remove on /chat:**
  - the 6-icon bottom bar (it does nothing and cramps the screen)
  - the "Run details / No active run" box
  - the home's "Recently updated" list and "Hand off a project" card (Remy chose "remove both")
- **The composer is cramped.** The "THINKING" label is cut off by the globe button.
- **Documents → Improve a file:** the "Keep content, fix layout" card is good, but its pictures are too thin.

**Design source:** https://claude.ai/artifact/Kq1PVTGHWR8XXe9jzQDEkk is byte-identical to `design/sutaeru-app/` in the repo (checked: `app.css` and `app.js` are the same). Its `#studio` view is the reference. Remy asked for a plan only; this file is that plan. Design and build happen after he approves it.

**Rules that stay in force** (`docs/spec/FRONTEND-REDO.md` and memory):
- Port the prototype; don't reinterpret it.
- No bottom bar. Navigation is the logo sheet.
- The big wordmark appears only on Home, landing, splash and onboarding.
- Art stays quiet and blended, never hard-edged.
- Reduced motion, 44 px tap targets, 4.5:1 contrast, light and dark.
- Don't touch `server/`.
- Never show model names to users.

---

## 1. The Studio standard (what "like Studio" means, exactly)

Every page is built from these parts. All of them are taken from the prototype's `#studio`.

| Part | Source in prototype | Rule |
|---|---|---|
| **Page head** | `.studio-head`, `stepsHTML()` (`app.js:852`, `:897`) | Back link, steps (only for multi-step flows), title 34 px (48 at ≥760), a lede of at most one sentence |
| **Picture tiles** | `.opt-group` / `.opts` / `.opt` (`app.js:915`, `studio.css`) | Every choice that has more than 2 options is a row of 116×86 picture tiles: caption plus one-line sub. Selected = ink outline, tick, focus brackets. No white select boxes anywhere |
| **Picture cards** | `.engine` cards | For 2–4 big choices: picture, name, short line, meters where useful |
| **Go bar** | `.go-bar` (`#studioGo`, `#agentGo`) | The only element docked at the bottom: a summary of the picks plus one primary button |
| **Fold** (new) | extends `.opt-group` and `<details class="credits-line">` | See below |

**The fold rule (the new part):**
- Each `.opt-group` becomes a **Fold section**. Folded, it is one 56–62 px row: mono label, the current pick in words, a 42×32 mini picture of the pick, and a chevron. Open, it shows the normal tile row.
- **Phones (<760 px):** one section open at a time (accordion). The first section that still needs input starts open; all others start folded.
- **Tablet and desktop:** several may be open; all start open at ≥1100.
- **Fold all / Open all** sits in the page head of any page with three or more sections.
- **Fold state is remembered per page** (`localStorage`, wrapped in try/catch, falling back to the defaults).
- Folding animates its height over 380 ms with `--ease`, and is instant under reduced motion.
- Built on the Radix Collapsible that already exists, or on `<details>` (whichever the survey shows is present). Each section gets `aria-expanded` and is keyboard operable.
- Inside content (answers, results), long helpers fold too: Sources, Thinking, Plan, "Turn this into" become one-line panels that open on tap.

---

## 2. Execution

### Step 0: Design boards first (Claude Design)

Canvas: https://claude.ai/artifact/YHjks7vNo7Gx9hQVpXhmhN. It is empty, and the Studio sample photos are already uploaded.

- Start from the prototype's `#studio` markup and CSS: copy its look, don't redraw it.
- Board list (phone 390, dark plus light): **Parts sheet** (Fold section folded and open, tiles, cards, go bar, composer), **Chat home**, **Mode sheet**, **Chat answer**, **Studio with folds**, **Agent / Deep research**, **New document**, **Improve a document**, **Files**, **Settings**, **Admin**, **List page** (Connections, Skills, Memories, Monitors), **Logo menu**, and **Desktop 1280** (folds on the left, sticky preview on the right).
- **Gate:** Remy approves the boards on his phone before any code changes.

### Step 1: Shared primitives (one PR, lands first)

Fold is built on `@radix-ui/react-collapsible` (already wrapped in `components/ui/collapsible.tsx`). Phone accordion mode uses `@radix-ui/react-accordion` (installed, unused). No new dependencies. Lab: copy `lab/LabHome.tsx`, wrap the screen in `LabLayout`, add a route in `lab/LabRouter.tsx`, add a link in `lab/LabIndex.tsx`, and add fixtures in `lab/fixtures/`.


New files:
- `client/src/components/studio/FoldSection.tsx`
- `client/src/components/studio/useFoldState.ts`
- `client/src/components/studio/PickTiles.tsx`
- `client/src/components/studio/GoBar.tsx`
- `client/src/styles/redo/fold.css`

What they do:
- `PickTiles` is the generic `.opts` row, taken out of `CameraGroupRow` in `StudioScreen.tsx`. It takes `{id, label, sub, art}` where `art` is an image or a drawn SVG.
- `GoBar` is taken out of Studio's go bar.
- `FoldSection` = header (label, pick, mini picture, chevron) plus the body (`PickTiles` or any children).
- Studio itself switches to these first. It must look identical when every section is open.
- Add `/__lab/parts` with every state.

### Step 2: Chat (highest priority, Remy's direct complaints)

All of these are inline in `client/src/pages/Chat.tsx`, which still mixes old shadcn and neon styles with the redo.

1. **Bottom icon bar: delete it.**
   - The bar is `.sutaeru-run-actions` (`Chat.tsx:1073-1081`) inside `.sutaeru-run-controls` (`:1060`). Remove it and its CSS (`styles/chat-reskin.css:93-140`, `styles/preview.css:29-34`).
   - Where its six actions go:
     - **History, New chat:** logo menu (`NavLogoMenu.tsx`).
     - **Mode:** the mode chip in the composer.
     - **Run settings:** the thread sheet (item 5).
     - **Run details:** delete. Running tasks already show under "Working for you" in the logo menu.
     - **Export:** the "…" menu in the answer header (`ChatHeader.tsx`).
2. **"Run details / No active run" box: delete it.** It is `.sutaeru-mobile-details` (`Chat.tsx:1082`); also remove the `mobileDetailsOpen` state (`:115`) and its CSS (`preview.css:33`, `chat-reskin.css:128`).
3. **Home** (`components/home/HomeScreen.tsx`, container `components/home/Home.tsx`, mounted at `Chat.tsx:878-910`):
   - **Remove both** (Remy, 2026-10-08):
     - the "Recently updated" list (`HomeScreen.tsx:75-86`, `RecentRow` `:99`);
     - the "Hand off a project" button (`:87-92`, `onHandoff` at `Chat.tsx`).
   - Past chats live only in the logo menu.
   - Home = logo button, mark, wordmark, tagline, dot ramp, composer. Nothing else.
   - Drop the now-unused `rows` and `onHandoff` props from `Home.tsx`, and update `home.test.ts` and `home-container.test.ts`.
4. **Composer** (`components/home/HomeComposer.tsx`; CSS in `styles/redo/composer.css` and `styles/redo/home.css:38-46`):
   - Field at least 3 lines at 18 px; padding 20/22.
   - Tools row: + (`:236`), then a **mode chip** replacing the Thinking chip (`:244-247`). The chip shows the current mode's icon and name and is never clipped; it opens the mode sheet.
   - Then private (`:262`), then send/voice at 50 px (`:272`).
   - The sources/globe pill (`:250-257`) moves into the mode sheet's "Sources" section.
   - Apply the same spacing to the thread composer `components/ChatInput.tsx`.
5. **Mode and thread sheet:** one sheet replaces both the mode cards (`CHAT_MODE_CARDS` `Chat.tsx:76-82`, markup `:1061-1072`, CSS `chat-reskin.css:147-162`) and the shadcn thread panel (`Chat.tsx:955-1055`). Take them out of `Chat.tsx` into `components/chat/ModeSheet.tsx`, a presentational component plus a lab route. It contains these Fold sections:
   - **Mode:** the five picture tiles. Code shows only for admins, as today.
   - **Model:** tiles "Auto / Fast / Best", never vendor names.
   - **Sources:** Web / Files / Drive.
   - **Tools:** pills from `ALL_TOOLS`.
   - **Private:** a toggle.
   - It uses the existing art `Sheet` on phones and a popover at ≥760.
6. **Answer:** Sources, Thinking (`components/chat/ThinkingBlock.tsx`, already a hand-rolled toggle) and "Turn this into" each fold to one line by default.

### Step 3: Create flows

- **Agent / Deep research:** output-type tiles, depth tiles with meters, sources, and the "Sutaeru will" plan, all as Fold sections plus a go bar.
- **New document:** steps; Start choice as two-up picture cards instead of full-width stacked cards; type, tone, length and sources as Fold sections; go bar.
- **Documents files:** `pages/Documents.tsx` (`OptionCard` `:42`, art `:22-39`), `pages/NewDocument.tsx` (`kindArt` `:95-125`), `pages/EditDocument.tsx` (cards `:740-786`, art `:104-122`, CSS `styles/edit-document.css`). Keep the `.a-paper/.a-line/.a-spot/.a-mark/.a-pen` art classes; move the art into `components/art/docArt.tsx` so all three pages share it.
- **Improve a document:**
  - Rewrite and Reformat become two-up cards with **before → after** art. Rewrite: struck lines become new lines. Reformat: a messy page becomes a clean two-column page.
  - "What should change" is open by default.
  - Extra sources and Style are folded.
- **Video:** same pattern as Studio.

### Step 4: Workspace pages

**Current state:**
- Settings (`SettingsView`) and Files (`FilesView`) are already on the redo system. They only need folds.
- Admin, Memories, Monitors, Connections, Invites, AuditLogs, More and Video are reskins (`sk-*` classes).
- Skills and Identity still use shadcn `ui/*`; move them fully onto the redo parts.
- The phone shell stays as it is: `DashboardLayout.tsx:466-472` (floating `NavLogoMenu` on /chat, `AppHeader` elsewhere).

- **Files:** search on top; Filters and Storage fold into one line each; document minis grid.
- **Settings:** each group (Appearance, Background art, Motion, Voice, Account) is a Fold section with a one-line summary. Theme is a set of picture tiles showing mini screens.
- **Admin:** the four stats go into one strip card instead of four tall cards; People rows; the Audit logs row folds.
- **Connections, Skills, Memories, Monitors, Identity:** one list-page pattern. Head, search, a Fold section per group, rows with a status badge.
- **Logo menu:** check it against the prototype `nav` (`app.js:2523–2536`). Make "Yours" foldable.

### Step 5: Release

- **Each step is its own PR into develop.**
- Before merging any step, I review Playwright screenshots of the lab and real routes against the boards at 360, 390 and 1280, light and dark.
- After Step 2 merges: release develop → main with `[skip ci]`, back up the DB, `docker compose build`, then `up -d`. Remy checks on his phone.
- Repeat the release after Steps 3 and 4.

---

## 3. Work rules for agents (strict)

- Work in a git worktree off `develop`. One step per PR. PR body: what was ported, what was polished, and anything NOT RUN.
- Only touch `client/`, plus `docs/` if a spec needs updating.
- Reuse what exists: tokens in `reskin-tokens.css`; `FocusBrackets`, `Toggle`, `SegSwitch`, `StudioFrame`, `SutaeruIcon`. New dependencies are not allowed.
- **Presentational component and container stay separate.** Every new state gets a lab route with fixtures.
- **No-regression list:** streaming, approvals, citations, attachments, voice, private chat, agent sessions, image runs, PWA update. All of these keep working; existing tests stay green.
- **Never add:** a bottom bar, example prompts, or a white select box. A choice of three or more never shows as a plain list when a picture tile fits.

## 4. Verification

- `npm run check`, `npm test` and `npm run build` pass. Lab code is not in `dist/`.
- **Playwright** (Docker image `mcr.microsoft.com/playwright:v1.58.2-jammy`):
  - lab and real routes at 360, 390, 1280, light and dark;
  - a phone check that /chat has no fixed bottom elements other than the composer.
- **Fold tests:**
  - folded headers show the current pick;
  - only one section is open on phones;
  - fold state persists after reload;
  - keyboard toggles a section; `aria-expanded` is correct.
- **Composer test:** the mode chip label is never clipped at 360 px. Check that its `scrollWidth` is no larger than its `clientWidth`.
- **Live check after each release:** Remy's screens (Home, mode sheet, thread sheet, Documents, Improve a file, Admin) compared with the boards.

---

## Status after Phase 1 and the plan for Phase 2 (updated 2026-10-09)

### What happened in Phase 1
- **Released and live** (main `dedf476`): the shared fold parts (`components/fold/**`: FoldSection, FoldGroup/useFoldState, PickTiles, Showcase, GoBar, PromptField, LiveTag, `/__lab/parts`), the Studio page rebuilt on them, and the /chat cleanup (bottom icon bar, run-details box, home recent list and hand-off card removed; spacious composer with the mode chip), plus 32 real images in `client/public/studio/o/` with `lib/pickArt.ts`.
- **Not released, work saved on branches:** `fe/ss-image-run` (new image-creation animation), `fe/ss-art-motion` (DotRamp logo in the chat, LivingBackground, motion tokens, art upgrade).
- **Still missing:** about two thirds of the images (AI Studio Gemini key ran out of credits; use Vertex), the mode/thread sheet, create flows, workspace pages, desktop layout.
- **Lessons (rules for Phase 2):**
  1. At most **2 agents at a time**, on `claude-sonnet-5-5`: the Claude usage limit is account-wide and five parallel agents hit it twice (03:50 and 08:50 UTC).
  2. Agents run as headless `claude -p` in tmux, **not** as in-session subagents (a session restart killed those and lost 4 hours). Autosave cron (`/root/kimi-work/studio-standard/autosave.sh`, every 15 min) commits and pushes `fe/ss-*` worktrees.
  3. Agents commit and push every slice, open a draft PR early, and write a status file.
  4. Launch flags: `--permission-mode acceptEdits --allowedTools ... --add-dir /root/kimi-work --add-dir /root/sr1 --add-dir /tmp/claude-0`; `--dangerously-skip-permissions` is refused for root.
  5. Release from clean worktrees: merge branches into develop, `npm ci`, `npm run check`, `npm test`, then main with `[skip ci]`, DB backup, `docker build` from the clean worktree, `docker compose up -d --no-build sutaeru`. Image merge conflicts: keep the `fe/ss-images` versions.

### Phase 2 (remaining frontend), in this order
Each item = one branch `fe/ss-<name>`, one draft PR into develop, then a release when two or three are merged and `check`/`test`/`build` pass.

| # | Package | Branch | Notes |
|---|---|---|---|
| 2.1 | Finish image-creation animation | `fe/ss-image-run` | Resume in `/root/wt-ss-a`. Premium diffusion-style reveal, honest phases, cold-start state, reduced motion |
| 2.2 | Finish art and motion | `fe/ss-art-motion` | Resume in `/root/wt-ss-b`. DotRamp logo in the real chat, LivingBackground, M3 motion tokens, icon upgrade. One-line mounts in Chat.tsx and DashboardLayout |
| 2.3 | Remaining images | `fe/ss-images` | Vertex AI generation: nav-*, depth-*, tone-*, len-*, style-*, theme-*, motion-*, voice-*, reformat-before/after |
| 2.4 | Mode and thread sheet + answer folds | `fe/ss-mode-sheet` | `components/chat/ModeSheet.tsx`; Showcase of five modes; Model/Sources/Tools/Private as folds; no vendor names; Answer folds Sources/Thinking/"Turn this into"; fix private-chat toast in the thread composer |
| 2.5 | Create flows | `fe/ss-create` | Agent builder (keep existing Report/Deck/Sheet/Image/Brief/Monitor art as Showcase), New document, Improve document (real before/after images), Video |
| 2.6 | Workspace pages | `fe/ss-workspace` | Files as a Google Drive style list (type icon, name, "type · size · date", type chips, sort), Settings, Admin, list pages, logo menu |
| 2.7 | Desktop layout | `fe/ss-desktop` | At 1100px and up: folds left, sticky live preview and GoBar right |
| 2.8 | QA and final release | n/a | Full lab pass, fix defects, release |

Run order given the 2-agent limit: (2.1 + 2.2), then (2.3 + 2.4), then (2.5 + 2.6), then (2.7 + 2.8). Release after each pair.

### Backend Phase 2
The paused backend work (PRs #95 and #98) was held until the frontend is live. It is **not** part of this plan and starts only after Remy says so.
