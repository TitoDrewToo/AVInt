# Pixelize Shader Prototype — Ready for Tuning

To preview:
  cd paperclip-2-news/pipeline
  npm run preview
  → Open the "pixelize-prototype" composition in the Studio sidebar.

Drop 3 reference images in pipeline/assets/placeholder-references/
(character-test.png, face-closeup-test.png, scene-test.png) before scrubbing.

Adjust input props live in the Studio:
  - pixelSize (1–12)
  - paletteSize (2–32)
  - ditherEnabled
  - outlineEnabled / outlineThreshold

When tuning lands, capture the values in PIXELIZE_TUNING.md
(see template below).

To re-tune later:
  Modify defaultProps in src/Root.tsx, or pass --props at render time.

To approve:
  Founder writes pipeline/src/effects/PIXELIZE_TUNING.md with the
  locked defaults; Codex updates Root.tsx defaultProps to match.

To request changes:
  Create REJECT.md in pipeline/src/effects/ with notes; Codex iterates
  on shader code.
