# Sutaeru Design Experiments

## Overview

This folder contains two complete design system experiments for Sutaeru. Each is a fully-specified token system that can be swapped into the main application.

---

## Quick Start

```bash
# Test Experiment #1 (Obsidian - current)
cp design-experiments/exp1-obsidian/design-tokens.css client/src/index.css

# Test Experiment #2 (Thermal - proposed)
cp design-experiments/exp2-thermal/design-tokens.css client/src/index.css
```

---

## The Experiments

### 📦 Experiment #1: Obsidian
- **Status**: Current implementation (backup)
- **Aesthetic**: Cold, technical, developer-tool
- **Colors**: Pure black (`#050505`) with white/gray
- **Feel**: VS Code, Linear, dark-mode SaaS
- **Folder**: `exp1-obsidian/`

**Best for**: Familiarity, blending in, technical users

---

### 🔥 Experiment #2: Thermal Presence
- **Status**: New - 5 years ahead
- **Aesthetic**: Living, breathing, thermal communication
- **Colors**: Warm bronze-black (`#1a1614`) with bioluminescent accents
- **Feel**: Organic AI agent, distinctive personality
- **Folder**: `exp2-thermal/`

**Best for**: Innovation, AI visibility, standing out

---

## Decision Guide

| If you want... | Use... |
|----------------|--------|
| Maximum familiarity | Exp #1: Obsidian |
| To blend with other tools | Exp #1: Obsidian |
| AI state visibility | Exp #2: Thermal |
| Distinctive brand | Exp #2: Thermal |
| To be 5 years ahead | Exp #2: Thermal |
| Warm, elegant feel | Exp #2: Thermal |

---

## Side-by-Side

```
OBSIDIAN                    THERMAL
─────────────────────────────────────────
#050505 (cold)            #1a1614 (warm)
White/gray accents        Bioluminescent glow
Hidden AI states          Visible thermal states
Technical feel            Organic, alive feel
Generic                   Distinctive
VS Code vibe              AI agent vibe
```

---

## Recommendation

**For Sutaeru: Experiment #2 (Thermal)**

**Why:**
- ✅ Matches original vision (dark rose + bronze)
- ✅ Makes AI work visible through color
- ✅ Distinctive in crowded market
- ✅ Feels like an agent, not a tool
- ✅ Future-proof innovation

---

## File Structure

```
design-experiments/
├── README.md              (this file)
├── COMPARISON.md          (detailed comparison)
├── exp1-obsidian/
│   ├── README.md          (obsidian details)
│   └── design-tokens.css  (complete token system)
└── exp2-thermal/
    ├── README.md          (thermal details)
    └── design-tokens.css  (complete token system)
```

---

## How to Use on Replit

1. Open the Shell
2. Navigate to project: `cd S1PRONTO-main`
3. Copy experiment tokens:
   ```bash
   # For thermal (recommended)
   cp design-experiments/exp2-thermal/design-tokens.css client/src/index.css

   # For obsidian (current)
   cp design-experiments/exp1-obsidian/design-tokens.css client/src/index.css
   ```
4. Refresh browser to see changes

---

## Experiment Details

Each experiment folder contains:
- **README.md**: Philosophy, pros/cons, implementation notes
- **design-tokens.css**: Complete CSS token system (100+ tokens)

Read both READMEs to understand the full design language.

---

## Next Steps

1. **Read COMPARISON.md** for detailed breakdown
2. **Review each experiment's README**
3. **Test both on Replit** (swap the CSS file)
4. **Compare side-by-side** in running app
5. **Choose your direction**
6. **Full implementation** (we can help)

---

## Questions to Decide

1. Should Sutaeru blend in or stand out?
2. Should AI states be visible or hidden?
3. Is the goal "safe" or "innovative"?
4. Do users want a tool or an agent?
5. Who are you designing for: 2025 or 2030?

---

*Design experiments created for Sutaeru (S1PRONTO)*
*Date: 2026-03-15*
