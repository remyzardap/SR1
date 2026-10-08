# Sutaeru design canvas (visual target)

These are the source files of the high-fidelity design canvas (15 phone artboards, 390x844): Home, Answer, Agent (brief), Studio, Run, Session, Result, Files, Settings, Menu, plus dark variants (`*Dark.dc.html` import the light screen with `theme="dark"`). They are the **exact visual target** for the React redo: sizes, colours (CSS variables at the top of each file's `renderVals`), type scale, radii, spacing, and the refined art touches (grain, graded dither bands, halftone fades, brackets, marks).

Read them as HTML + inline styles; ignore the `{{...}}` holes and `<sc-for>` (they are template syntax). `/_blob/<id>` image URLs map to the photos in `client/public/studio/` (golden mug = light-golden, window = light-window, night = light-night, backlit = light-backlit, solar/village/jakarta/panels covers = cov-*).

Rules the canvas follows (also in docs/spec/FRONTEND-REDO.md): big Sutaeru logo only on Home, landing, splash and onboarding; art touches must blend (no hard edges); no bottom bar; 44 px tap targets.
