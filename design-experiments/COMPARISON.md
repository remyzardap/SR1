# Design Experiments: Comparison Overview

## Quick Reference

| | **Experiment #1** | **Experiment #2** |
|---|---|---|
| **Name** | Obsidian | Thermal Presence |
| **Status** | ✅ Current (backup) | 🆕 Proposed |
| **Base Color** | `#050505` (cold black) | `#1a1614` (warm bronze) |
| **Aesthetic** | Technical, sterile | Organic, alive |
| **Accents** | White/gray hierarchy | Bioluminescent glow |
| **Innovation** | Safe, familiar | **5 years ahead** |
| **AI States** | Not visible | Thermal colors |
| **Feel** | Dev tool (VS Code) | Living agent |

---

## Visual Comparison

### Experiment #1: Obsidian
```
┌─────────────────────────────────────┐
│  #050505 (pure black background)    │
│  ┌──────────┐                        │
│  │  Block   │  ← White/gray cards   │
│  └──────────┘  with shadow depth    │
│  ┌──────────┐                        │
│  │  Block   │                        │
│  └──────────┘                        │
└─────────────────────────────────────┘
```
**Characteristics:**
- Cold, technical
- Familiar (like VS Code)
- Generic dark mode
- High contrast
- No personality

---

### Experiment #2: Thermal Presence
```
┌─────────────────────────────────────┐
│  #1a1614 (warm bronze-black)        │
│  ╔══════════╗  ← Subtle rose glow   │
│  ║  Block   ║     (thinking)        │
│  ╚══════════╝                        │
│  ╔══════════╗  ← Teal wash          │
│  ║  Block   ║     (complete)         │
│  ╚══════════╝                        │
└─────────────────────────────────────┘
```
**Characteristics:**
- Warm, organic
- Alive (breathing)
- Color communicates state
- Unique/distinctive
- Matches Sutaeru vision

---

## Side-by-Side Token Comparison

### Base Colors
| Token | Exp #1 | Exp #2 | Difference |
|-------|-------|-------|------------|
| Background | `#050505` | `#1a1614` | +warmth |
| Raised | `#0d0d0d` | `#262018` | +bronze |
| Border | `rgba(255,255,255,0.08)` | `rgba(212,98,111,0.12)` | rose tint |

### Accents
| Token | Exp #1 | Exp #2 | Change |
|-------|-------|-------|--------|
| Primary | `#f2f2f2` | `#d4626f` | White → Rose |
| Secondary | `#2dd4bf` | `#5eb8a8` | Teal → Warmer teal |
| Accent | `#f59e0b` | `#d4a057` | Orange → Bronze |

### Text
| Token | Exp #1 | Exp #2 |
|-------|-------|-------|
| Primary | `#f2f2f2` | `#f7f4f0` |
| Secondary | `rgba(242,242,242,0.50)` | `rgba(247,244,240,0.65)` |

---

## Innovation Checklist

### Experiment #1: What's Standard
- ✅ Elevation system (5 levels)
- ✅ Spring physics
- ✅ High contrast
- ✅ Modern typography
- ❌ No AI state communication
- ❌ Generic aesthetic
- ❌ Cold feeling

### Experiment #2: What's New
- ✅ **Thermal state system** (AI shows its work)
- ✅ **Bioluminescent colors** (glow, not flat)
- ✅ **Organic geometry** (grown, not machined)
- ✅ **Living surfaces** (breathing animation)
- ✅ **Noise texture** (tactile feel)
- ✅ **Flow transitions** (no snapping)
- ✅ **Unique personality** (distinctive)

---

## Use Case: When to Use Which

### Use Experiment #1 (Obsidian) If:
- Building a developer tool
- Want maximum familiarity
- Need to blend in with existing tools
- Targeting technical users only
- Priority: readability over personality

### Use Experiment #2 (Thermal) If:
- Building an AI agent product
- Want to stand out
- Need to show AI thinking/working
- Targeting broader audience
- Priority: personality + innovation
- **Want to be 5 years ahead**

---

## File Structure

```
design-experiments/
├── COMPARISON.md          (this file)
├── README.md              (overview)
├── exp1-obsidian/
│   ├── README.md
│   └── design-tokens.css
└── exp2-thermal/
    ├── README.md
    └── design-tokens.css
```

---

## How to Test (Replit)

### Option 1: Direct File Swap
```bash
# Copy to main CSS
cp design-experiments/exp1-obsidian/design-tokens.css client/src/index.css
# or
cp design-experiments/exp2-thermal/design-tokens.css client/src/index.css
```

### Option 2: Import in index.css
```css
/* At the top of client/src/index.css */
@import "./design-experiments/exp1-obsidian/design-tokens.css";
/* or */
@import "./design-experiments/exp2-thermal/design-tokens.css";
```

### Option 3: Build Switcher Component
```tsx
// Add temporary dev mode switcher
const [experiment, setExperiment] = useState<'obsidian' | 'thermal'>('obsidian');
```

---

## Recommendation

**For Sutaeru: Use Experiment #2 (Thermal)**

**Why:**
1. Matches original vision (dark rose + bronze chocolate)
2. Makes AI state visible (thermal communication)
3. Distinctive in the market (not "another dark SaaS")
4. Feels like an AGENT, not a tool
5. 5 years ahead of current trends

**Experiment #1 is a safe backup**, but Sutaeru was meant to be innovative.

---

## Decision Matrix

| Priority | Exp #1 | Exp #2 |
|----------|--------|--------|
| Innovation | ❌ Generic | ✅ Pioneering |
| Sutaeru Vision | ❌ Cold | ✅ Warm/Masculine |
| AI Communication | ❌ Hidden | ✅ Visible |
| Memorability | ❌ Forgettable | ✅ Distinctive |
| Differentiation | ❌ Blends in | ✅ Stands out |
| Future-Proof | ❌ Current trend | ✅ Next generation |

**Winner: Experiment #2** 🏆

---

## Next Steps

1. **Review both experiment folders**
2. **Test on Replit** (copy thermal tokens to index.css)
3. **Compare side-by-side**
4. **Make decision**
5. **Full implementation** of chosen system

---

*Generated for Sutaeru Design Experiment*
