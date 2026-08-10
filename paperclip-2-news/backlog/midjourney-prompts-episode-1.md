# Character Generation Prompts — Episode 1 Cast

> **NOTE — pipeline updated:** We've moved from Midjourney to **local
> ComfyUI + Pony Diffusion XL + Persona 5 LoRA** (no API costs). The
> creative direction in this file still applies — the descriptions of
> hair, skin, eyes, outfit, accessories, posture are all valid. But the
> SDXL prompt format differs from Midjourney syntax. See
> `CHARACTER_BUILD_BRIEF.md` Step 4 for the SDXL prompt template Codex
> uses (`score_9, score_8_up, ...` quality tags + comma-separated
> descriptors + negative prompt).
>
> Use this file as **creative reference**. Codex translates these into
> the SDXL syntax automatically.

Generation prompts for the four Episode 1 main characters. Codex generates
locally in ComfyUI; you pick the best variant; DragonBones rig follows.
Original Midjourney syntax preserved below as creative reference.

## Universal Style Prefix

Every prompt begins with this style anchor (paste verbatim):

```
Persona 5 anime character art with Octopath Traveler HD-2D pixel-art
treatment, cel-shaded with soft pixel detail in fabric and hair, tall
slim anime proportions, dramatic silhouette recognizable in outline,
character reference sheet style with multiple poses and expressions,
plain white background, color blocking with 2-3 dominant colors,
```

## Universal Style Suffix

Every prompt ends with this:

```
--ar 3:2 --style raw --v 7
```

Use `--ar 2:3` for vertical / standing-only sheets if preferred.

---

## 1. Chloe Antropova — Lead Anchor

**Reference for silhouette:** Sae Niijima energy.

```
Persona 5 anime character art with Octopath Traveler HD-2D pixel-art
treatment, cel-shaded with soft pixel detail in fabric and hair, tall
slim anime proportions, dramatic silhouette recognizable in outline,
character reference sheet style with multiple poses and expressions,
plain white background, color blocking with 2-3 dominant colors,
female news anchor in her early 30s, deep chocolate brown hair pulled
back into a sleek low ponytail with face-framing strands, warm beige
skin, hazel-amber eyes with composed expression, structured cream
single-button blazer with warm-orange piping on lapel and cuffs, white
silk shell underneath, gold statement earrings, small geometric
constitutional pin on lapel, multiple views: front standing, three-
quarter view, sitting at anchor desk with hands clasped, six mouth
shapes (closed, slightly open, wide open, A-shape, E-shape, O-shape),
four eye states (open, half-closed, closed, looking aside), composed
elegant posture, warm key lighting
--ar 3:2 --style raw --v 7
```

---

## 2. Cody Apnea — Co-Anchor

**Reference for silhouette:** Akechi (charismatic-but-suspect young
professional).

```
Persona 5 anime character art with Octopath Traveler HD-2D pixel-art
treatment, cel-shaded with soft pixel detail in fabric and hair, tall
slim anime proportions, dramatic silhouette recognizable in outline,
character reference sheet style with multiple poses and expressions,
plain white background, color blocking with 2-3 dominant colors,
male co-anchor late 20s, dark brown hair slicked back with high gloss
and sharp side part, light-medium American complexion, sharp pale blue
eyes always slightly too wide, black tailored two-button suit with
deep green tie, white pressed shirt, dark green pocket square, small
abstract circular lapel pin, multiple views: front standing, three-
quarter view, sitting at anchor desk leaning forward with hands on
desk, additional frozen-mid-breath variant for apnea bit (eyes wide,
mouth slightly open mid-inhale), six mouth shapes (closed, slightly
open, wide open, A-shape, E-shape, O-shape), four eye states (open,
half-closed, closed, looking aside), evangelistic confident posture,
bright presentation lighting with subtle green wash
--ar 3:2 --style raw --v 7
```

---

## 3. Gem Bardelli — Field Reporter

**Reference for silhouette:** Ann Takamaki energy but corporate-PR.

```
Persona 5 anime character art with Octopath Traveler HD-2D pixel-art
treatment, cel-shaded with soft pixel detail in fabric and hair, tall
slim anime proportions, dramatic silhouette recognizable in outline,
character reference sheet style with multiple poses and expressions,
plain white background, color blocking with 2-3 dominant colors,
female field reporter late 20s, blonde hair with subtle multi-colored
highlights of blue red and yellow streaks, layered bouncy cut, light
skin with warm peachy undertone, bright big blue eyes, cheerful
helpful expression, pastel pink blazer over white tee variation,
holding oversized chunky microphone with cube logo, multiple bracelets,
bright pastel earrings, multiple views: front standing holding mic,
three-quarter view, animated gesturing pose with mic raised, six mouth
shapes (closed, slightly open, wide open, A-shape, E-shape, O-shape),
four eye states (open, half-closed, closed, looking aside), bouncy
animated posture, multicolor sparkle particle accents, bouncy bright
lighting with rainbow gradient highlights
--ar 3:2 --style raw --v 7
```

**Note:** Gem's blazer rotates by episode. Generate this master in pink;
use `--cref` later for sky blue, butter yellow, mint green variants if
you want pre-baked alternates.

---

## 4. Grock Maskovich — Tech & Business Correspondent

**Reference:** Elon-Musk-pattern silhouette and styling — parody-distinct
face, NOT exact replica (legal: trademark + right-of-publicity safe).

```
Persona 5 anime character art with Octopath Traveler HD-2D pixel-art
treatment, cel-shaded with soft pixel detail in fabric and hair, tall
slim anime proportions, dramatic silhouette recognizable in outline,
character reference sheet style with multiple poses and expressions,
plain white background, color blocking with 2-3 dominant colors,
male tech correspondent late 30s, lean build slightly stiff posture,
light brown hair with slight thinning at temples styled mid-length and
purposefully disheveled, light skin slightly tanned, dark eyes with
conspiratorial gleam, smirk expression, charcoal black suit jacket
with white shirt, no tie, open collar (uncomfortable in formal wear
but pretending he isn't), small red angular X-shape pin worn upside
down on lapel, multiple views: front standing, three-quarter view,
sitting at desk leaning back with arms crossed (smug variant), leaning
forward delivering hot take (intense variant), six mouth shapes
(closed, slightly open, wide open, A-shape, E-shape, O-shape), four
eye states (open, half-closed, closed, looking aside), smug
contrarian posture, dramatic red rim lighting from background
--ar 3:2 --style raw --v 7
```

---

## Workflow per character

1. **Generate the master** — paste prompt into Midjourney, get 4 variations
2. **Pick winner** — save as `<name>-master.png`
3. **Quality check against silhouette test** — does the black silhouette read as the character?
4. **Optional variations** — if the master sheet doesn't include enough mouth/eye states, generate variants using `--cref [master].png --cw 100` with prompt modifiers like:
   - "same character, mouth shape A (open vowel)"
   - "same character, eyes half-closed, weary expression"
   - "same character, hand gesturing toward camera"
5. **Inkscape trace** — open each PNG in Inkscape, run `Path > Trace Bitmap` (Brightness cutoff or Edge detection), clean up the result
6. **Decompose into layers** — split the SVG into separate files: `head.svg`, `body.svg`, `mouth-A.svg` through `mouth-F.svg`, `eye-open.svg` etc.
7. **Drop in pipeline** — place files in `pipeline/src/characters/<name>/` along with `config.json`

## Time estimate per character

- Midjourney generation + selection: 15–30 min
- Inkscape trace + cleanup: 30–45 min
- Layer decomposition + config: 30–45 min
- **Total: ~1.5–2 hours per character × 4 characters = 6–8 hours total for Episode 1 cast**

## After Episode 1

Generate Cole Office in voice-only-silhouette form for Episode 1 (just a
shadow in the production booth). Full Cole rig waits until first
episode he visually appears in.

For Episodes 2–6: generate one new character per episode in advance,
following the same workflow. By the time Episode 6 ships, full Tier 1
cast is rigged.
