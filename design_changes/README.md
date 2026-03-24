# Design Changes

These are duplicates of the original files.
Apply the new Sutaeru OS Board design system to these files.
Once approved — copy back to client/src/

## Design system reference
- File: sutaeru-os-v5.html (on VPS or from Claude chat)
- Fonts: DM Serif Display (headings) + Instrument Sans (body) + DM Mono (labels)
- Background: #F0EBE3 warm cream
- Surface: #FFFFFF cards
- Accent: var(--a) — user theme color
- Shadows: 5-layer shine system (see v5 HTML)
- Border radius: 22px blocks, 14px inner cards
- NO flat shadows — always multi-layer
- NO cold whites — always warm whites

## Pages priority order
1. Board.tsx — main OS board (highest priority)
2. Chat.tsx — Kemma chat interface
3. DashboardLayout.tsx — shell/wrapper
4. Settings.tsx — theme switcher lives here
5. Everything else

## Rules
- Keep all logic identical — only change styles
- Use CSS variables from design system
- Test each page before marking done
