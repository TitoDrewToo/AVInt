# Codex Pixelize Shader Brief — Phase 0 (Foundation, Pre-Asset)

**Prerequisites:**
- `pipeline/SETUP_BRIEF.md` complete; `make verify` passes ✅
- Existing pipeline scaffold present: `pipeline/src/components/{Character,CharacterRig,ParallaxScene,KineticOverlay,LipSyncDriver}.tsx`
- Apple Silicon Mac

If any prerequisite missing, halt and report.

## Goal

Build the **pixelize-quantize post-processing shader** that defines the
show's surface aesthetic — and a **Remotion Studio preview composition**
the founder can scrub live to dial in tuning.

Nothing else. No ComfyUI install, no character generation, no DragonBones,
no scene parallax. Just the shader + a preview surface.

This is Phase 0 because every downstream asset (character masters, scene
plates, expression atlases) will be evaluated under this shader. We pick
the shader's defaults first, then build assets that survive it.

## Aesthetic Target — Lock This Before You Code

The show's surface is defined as:

- **Octopath Traveler HD-2D + Replaced** = primary surface treatment.
  Pixel-painted texture, atmospheric depth-of-field, cel-shaded, palette
  discipline.
- **Persona 5** = character body proportions + UI/effect overlays.
  Bodies and posing follow `shared/character-visual-specs.md`; kinetic
  typography per `shared/persona5-ui-design-language.md` punches in over
  the pixelized world at native resolution (sharp UI on pixel world,
  exactly how P5 itself does it).

Practical translation: **a Persona-5-bodied character render gets the
pixelize-quantize pass applied to it, while UI overlays composite on top
afterward at native resolution.** The shader is the bridge between the
Persona 5 character DNA we already have specced and the Octopath/Replaced
texture we want.

**Hard constraint: face emotion must remain readable post-pixelize.**
Eyes blinking, mouth shapes during speech, smiles, laughs, confusion,
surprise — all must read clearly. The shader uniformity is fine for body
+ scene; the face survives because face-region textures will be authored
at higher pixel density (handled in later character brief, not here).
For this brief, the prototype must let the founder visually verify that
a face holds up under the chosen pixel size.

## What You Read First

1. `paperclip-2-news/agents/animation-engineer.md` — Layer 3 explicitly
   names post-processing shaders as the "pop" layer. This shader belongs
   there.
2. `paperclip-2-news/shared/persona5-ui-design-language.md` — palette
   foundations. Ink-black `#0A0A0A`, paper-white `#FAFAF5`, accent-red
   `#E63946`.
3. `paperclip-2-news/shared/character-visual-specs.md` — per-character
   primary/accent colors that future palette-quantize seeding will draw
   from.
4. https://github.com/pmndrs/postprocessing — `Effect` base class docs
5. https://github.com/pmndrs/react-postprocessing — R3F integration

## Architecture (locked)

```
Future production frame:
  R3F scene (DragonBones character + parallax glTF)
    │
    └─→ EffectComposer
          │
          ├─→ [Phase 0: this brief] PixelizeQuantizeEffect ← downsample + palette
          │     (and optionally dither / outline)
          │
          └─→ Render to canvas
                │
                ↓
          Remotion overlay layer (UI: lower-thirds, ticker, callouts)
                │  ← composites at native res, NOT pixelized
                ↓
          Final frame
```

For this brief you build **only the PixelizeQuantizeEffect** and a
preview composition that pipes a placeholder image through it. The
DragonBones / parallax / overlay layers are out of scope.

## Step 1 — Install postprocessing dependencies

In `pipeline/`:

```bash
npm install --save postprocessing @react-three/postprocessing
```

Both are MIT — no license complications. Verify install with `npm ls
postprocessing @react-three/postprocessing`.

## Step 2 — Build the shader

Create `pipeline/src/effects/PixelizeQuantizeEffect.ts`. Extend
`postprocessing`'s `Effect` base class. The fragment shader does, in order:

1. **Pixelate (downsample to grid):** snap UV to a fixed pixel grid based
   on a `pixelSize` uniform.
   ```glsl
   vec2 dxy = pixelSize / resolution;
   vec2 snappedUV = dxy * floor(uv / dxy) + dxy * 0.5;
   vec4 sampled = texture2D(inputBuffer, snappedUV);
   ```
2. **Quantize (per-channel posterize):** reduce color depth using a
   `paletteSize` uniform (number of levels per channel).
   ```glsl
   vec3 quantized = floor(sampled.rgb * paletteSize) / (paletteSize - 1.0);
   ```
3. **Optional dither (Bayer 4×4):** if `ditherEnabled` is true, bias each
   pixel between two nearest palette levels using a Bayer matrix sampled
   at the original (pre-snap) UV. This recovers gradient illusion lost
   to harsh quantize. Use a hardcoded 4×4 Bayer matrix in the shader.
4. **Optional outline (luminance edge detect):** if `outlineEnabled` is
   true, compare the luminance of the current pixel against neighbors
   at a `outlineThickness` step in the original buffer; if delta exceeds
   a `outlineThreshold`, output the outline color (default `#0A0A0A`
   ink-black to match P5 palette). Persona 5 character outlines are a
   signature — keep this option available even if defaulted off.

Uniforms exposed:
- `pixelSize: number` (default 4.0, range 1–12)
- `paletteSize: number` (default 8.0, range 2–32)
- `ditherEnabled: boolean` (default false)
- `outlineEnabled: boolean` (default false)
- `outlineThreshold: number` (default 0.15, range 0.05–0.5)
- `outlineColor: Color` (default `#0A0A0A`)

Wrap as an R3F-friendly component
`pipeline/src/effects/PixelizeQuantize.tsx` that consumes the Effect via
`@react-three/postprocessing`'s `EffectComposer` + custom effect pattern.

## Step 3 — Build the preview composition

Create `pipeline/src/compositions/PixelizePrototype.tsx`. Structure:

- A Remotion `<Composition>` wrapping an R3F `<Canvas>`.
- Inside the Canvas: a single full-screen plane mesh textured with a
  reference image, viewed by an orthographic camera. (We are not yet
  rendering 3D content — the texture-on-plane is the substrate the
  shader operates on.)
- An `<EffectComposer>` with the `<PixelizeQuantize />` effect applied.
- All shader uniforms exposed as **Remotion input props** so they appear
  in the Studio sidebar as live-editable controls.
- An additional input prop `referenceImage: string` selects which
  placeholder image to load. Default to the first found in the
  `placeholder-references/` folder.

Reference images live at
`pipeline/assets/placeholder-references/`. Founder will drop 3 PNGs
there before scrubbing:
- `character-test.png` — anime-style character portrait (full body or
  half body) for body+face surface evaluation
- `face-closeup-test.png` — tight crop of a face for face-detail and
  expression-readability evaluation
- `scene-test.png` — Octopath/Replaced-style scene reference for scene
  surface evaluation

If the folder is empty, render a procedural fallback test pattern:
- Solid background gradient (top-to-bottom, paper-white → ink-black)
- 3 colored rectangles (char primary colors from spec: cream, charcoal,
  warm-orange) at varying sizes
- A simple face mockup (circle head, two eye dots, mouth arc) so face
  emotion preservation can be evaluated against geometry even without a
  real character image

Composition spec:
- 1920×1080, 30fps, 90 frames (3 seconds — single static frame is enough
  for tuning, but Remotion needs duration > 0).
- ID `pixelize-prototype`.

## Step 4 — Register in Root.tsx

Update `pipeline/src/Root.tsx` to register the new composition alongside
the existing `smoke-test`:

```tsx
import { Composition } from "remotion";
import { SmokeTest } from "./compositions/SmokeTest";
import { PixelizePrototype } from "./compositions/PixelizePrototype";

export function Root() {
  return (
    <>
      <Composition
        id="smoke-test"
        component={SmokeTest}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="pixelize-prototype"
        component={PixelizePrototype}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          pixelSize: 4,
          paletteSize: 8,
          ditherEnabled: false,
          outlineEnabled: false,
          outlineThreshold: 0.15,
          referenceImage: "character-test.png"
        }}
      />
    </>
  );
}
```

## Step 5 — Founder review gate (the only gate)

Once Steps 1–4 are complete and `npm run preview` (which runs
`remotion studio src/index.tsx`) opens the Studio without errors,
write `pipeline/src/effects/READY_FOR_REVIEW.md`:

```markdown
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
```

Codex polls every 60 seconds for `PIXELIZE_TUNING.md` (locked defaults)
or `REJECT.md` (iterate) and acts accordingly.

## Step 6 — Output the tuning template

Pre-create `pipeline/src/effects/PIXELIZE_TUNING.template.md` that the
founder copies to `PIXELIZE_TUNING.md` once they lock values:

```markdown
# Pixelize Tuning — Locked

## Defaults (apply globally to character + scene rendering)

- pixelSize: <N>
- paletteSize: <N>
- ditherEnabled: <true|false>
- outlineEnabled: <true|false>
- outlineThreshold: <0.0–0.5>
- outlineColor: <hex>

## Notes from tuning session

- Face emotion legibility: <pass / borderline / fail at this pixelSize>
- Reference image evaluations:
  - character-test.png at pixelSize=N: <observation>
  - face-closeup-test.png at pixelSize=N: <observation>
  - scene-test.png at pixelSize=N: <observation>
- Aesthetic verdict: closer to Octopath-subtle / Replaced-pronounced / between
- Open question for next phase (e.g., face slot textures need 2× density):
  <observation>

## Future per-region overrides (v2 — not implemented yet)

- Face slot composite override: face-region pixelSize = <N> (smaller for detail)
- Scene background override: scene-region pixelSize = <N> (larger for atmosphere)
```

This file is the founder's deliverable; Codex doesn't write the values,
only the template.

## Closure Criteria

Phase 0 closes when **all four** are true:

1. `npm run preview` opens Remotion Studio without errors and the
   `pixelize-prototype` composition is visible and renders.
2. Live-editable input props in Studio sidebar update the shader output
   in real time (founder observes pixel size and palette size changing
   visibly when sliders move).
3. Founder writes `PIXELIZE_TUNING.md` with locked default values that
   produce: (a) recognizably pixel-art surface on character + scene
   reference images, AND (b) preserved face emotion legibility on the
   face-closeup reference.
4. Codex updates `Root.tsx` defaultProps to match locked tuning, and
   writes a final report.

## Cost: $0

No API calls. Pure local TypeScript + GLSL. Takes a few hours of agent
work + one founder tuning session.

## What You Do NOT Do

- Do NOT install ComfyUI / SDXL / any image-gen tooling
- Do NOT generate any character or scene art
- Do NOT install or touch DragonBones / parallax-maker
- Do NOT modify the existing `Character.tsx`, `CharacterRig.tsx`,
  `ParallaxScene.tsx`, `KineticOverlay.tsx`, or `LipSyncDriver.tsx`
  components — they are downstream of this work
- Do NOT modify any file outside `paperclip-2-news/pipeline/`
- Do NOT modify `paperclip-2-news/shared/*` specs
- Do NOT auto-publish anywhere
- Do NOT commit to git (founder reviews + commits)
- Do NOT pre-pick reference images or pull them from the internet — the
  founder drops them in the placeholder folder. If absent, render the
  procedural fallback (Step 3).
- Do NOT add a palette-lookup mode (palette texture upload, fixed
  palette enforcement). Per-channel posterize is sufficient for v1; full
  palette lookup is a v2 follow-up after we know what palettes the
  characters actually need.
- Do NOT attempt face-region masking / variable-density pixelize. Face
  detail preservation in v1 comes from authoring face slot textures at
  higher source resolution in the future character brief, not from
  this shader. This shader is uniform.

## Final Report

When done, output:

1. Files created (with line counts)
2. Dependencies added to `package.json`
3. `npm run preview` smoke-test result (Studio opens? Composition
   renders? Sliders responsive?)
4. Any decisions made (e.g., "fell back to procedural test pattern
   because placeholder folder was empty")
5. Any blockers (e.g., postprocessing version conflict with installed
   three.js version)
6. Estimated handoff to Phase A (character build): blocked on founder
   writing `PIXELIZE_TUNING.md`.

If anything is ambiguous, halt and ask the founder rather than guessing.
