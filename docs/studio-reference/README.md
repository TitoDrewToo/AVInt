# Studio library — reference implementations

These are **working reference implementations**, not mockups. Each file opens
directly in a browser with no build step. They are the specification for
`components/studio/`.

Open one, use it, then port it. Do not reinterpret it.

```
open docs/studio-reference/04-mega-menu.html
```

Every file has the same shape:

- `contract.css` is linked, never edited
- a palette switcher across the four client palettes
- a `<pre class="note">` block explaining what is easy to get wrong
- one `<style>` block and one `<script>` block that are **the component** —
  everything else in the file is harness and is marked as such

---

## Where these came from

I opened the three reference sites on 22 Aug 2026 and worked from what was
actually on screen. Each file's `source` line says which one, and whether it
was observed directly.

| Site | What I got |
|---|---|
| `gsap.com` | Full interaction — nav hover, the Tools mega-menu, the Get GSAP button, the scroll-scrubbed hero, the marquee band, section inversion |
| `santionispirits.com` | Preload sequence only — logo drawing itself in as one continuous stroke, line-art medallion, hand-drawn progress rule, charcoal ground. The WebGL body never finished loading |
| `activetheory.net` | Preload sequence only — ASCII-glyph disc filling around a numeric counter, monospace, pure black. Stalled at 75 |

Both Active Theory sites **stalled mid-preload on a normal desktop browser.**
That is a constraint, not a criticism: they are heavy WebGL experiences that
assume a GPU and patience. If we build that way for a venue whose customers
arrive on mid-range Android, the site does not load. The grammar transfers.
The weight must not.

---

## Two layers — only one of them is a library

| Layer A — the grammar | Layer B — the set piece |
|---|---|
| Structure and behaviour. Identical across every client; only the tokens change. | The thing people remember. Cannot be a component. |
| Preload gate, transitions, cursor, sound bus | Santioni's WebGL bottle and its custom typeface |
| Mega-menu, dropdowns, overlays, controls | Its hand-drawn medallion and wobbling rule |
| Split-text reveals, marquees, draw-on strokes | Active Theory's ASCII disc — *their* mark, not a widget |
| Alternating blocks, scroll-pinned acts | Original sound design |

**This library is Layer A only.** It gets a client to a site that moves and
behaves like the references. The moment that makes it *theirs* is a separate
line item, costed per project. The library provides the stage those drop into
— the gate, the pinned act, the audio bus — never the content.

---

## The contract

`contract.css` is the whole design system. Sixteen public tokens:

```
--brand  --brand-ink  --surface  --surface-2  --line  --text  --text-dim
--radius
--font-display  --font-body  --font-mono
--dur-fast  --dur  --dur-slow  --ease  --ease-io
```

Six of these are **new since the first brief**, and the change is purely
additive — nothing already built breaks:

| New token | Why |
|---|---|
| `--font-display` `--font-body` `--font-mono` | Type carries as much brand as colour. The gallery and clinic palettes deliberately use a different display face from ember and venue. |
| `--dur-fast` `--dur-slow` | One duration cannot serve a 120ms hover flip and a 720ms gate exit. |
| `--ease-io` | Entrances and two-state travel need different curves. `--ease` is for anything arriving; `--ease-io` for anything moving between two known states. |

Nothing else may appear inside a component: no literal colours, no hard-coded
ms or easing curves, no `glass-surface` / `cw-button-flow` / `retro-grid-bg` /
`hover-bloom` / `cw-ring-accent`, no `text-primary` / `bg-card` /
`border-border`, nothing imported from the avint app.

### The acceptance test

A component is done when it renders correctly under **all four palettes**.
Two of the four are light grounds on purpose. A component that only works on
dark is not finished.

### Block inversion

Both reference sites alternate light and dark sections down the page. That is
**not** a second theme. One attribute — `data-block="invert"` — swaps
`--surface` and `--text` inside the same token set, so every component nested
inside inverts for free and none of them need to know.

The swap cannot be written as `--surface: var(--text); --text: var(--surface)`
— that is a cycle and both properties go invalid. Each palette therefore also
declares two private anchors, `--_ground` and `--_ink`, which are never
redefined. Only `contract.css` reads them. **Do not use `--_ground` or
`--_ink` inside a component.**

---

## Build order

Stage (a) is already done — sections, registry, palette switcher, the old
21KB `studio-asset-inventory.tsx` removed. Do not redo it. Extend it.

| Stage | Components |
|---|---|
| **1** | pill button · text-roll button · magnetic button · filter chip row · search field · dropdown · modal · block-inversion wrapper |
| **2** | mega-menu · nav link set · full-screen menu · drawer · split-text reveal · display statement · stacked label · marquee band · draw-on SVG |
| **Ad hoc** | preload gate · page-transition shell · custom cursor · sound bus + toggle · scroll-pinned act |

Stage 1 alone is a shippable client site. Stage 2 makes it feel authored.

**There is no stage 3.** The experience layer is `Ad hoc`: it is not on the
roadmap and does not get ported on a schedule. Three of the five already have
working references (`08`, `13`) and those stay on the catalogue page as
capability, not as a promise. When a project needs one, we capture a fresh
reference against that project's brief and build it then — which is also when
we will know what it actually has to do.

**Stop after stage 1** and show the palette switcher working across all eight
components before starting stage 2.

---

## Rules for every component

- one component per file under `components/studio/`, each exporting a single
  component plus its types
- no barrel file that pulls in everything
- each file must be copy-pasteable into a fresh Next.js project with only the
  token block, and compile
- a visible `:focus-visible` state
- honours `prefers-reduced-motion`
- keyboard operable — Escape closes overlays, Tab is trapped in modals
- no layout shift on hover
- animate `transform` and `opacity`; animate `width`/`height` only where a
  reference file does (the mega-menu panel, and it explains why)

## Rules for the gallery page

Each component gets its own card with a **real working instance**, not a
static preview. The card header carries the name, one line on what it does,
and where it came from. Three assets in a section means three different
components — never one preview reused under three labels.

---

## Files

| File | Source |
|---|---|
| `contract.css` | the whole design system |
| `01-pill-button.html` | observed: gsap.com "Get GSAP" |
| `02-text-roll-button.html` | house pattern |
| `03-magnetic-button.html` | house pattern |
| `04-mega-menu.html` | observed: gsap.com nav |
| `05-dropdown.html` | house pattern |
| `06-modal.html` | rev 1 got this wrong |
| `07-draw-on-mark.html` | observed: santionispirits.com logo |
| `08-preload-gate.html` | observed: activetheory.net |
| `09-marquee-band.html` | observed: gsap.com/showcase |
| `10-split-text.html` | observed: gsap.com "Why GSAP®" |
| `11-stacked-label.html` | observed: gsap.com "Animate Anything" |
| `12-block-inversion.html` | observed: both references |
| `13-cursor-and-sound.html` | the Active Theory experience layer |

### Three that are easy to get wrong

**`04-mega-menu.html`** — the panel must be measured at its *target* width
with the transition suppressed. Measure it mid-transition and the panel opens
with dead space at the bottom. The notch is a sibling of the panel, not a
child: the panel needs `overflow: hidden` for the height tween, which would
clip a child notch.

**`10-split-text.html`** — masked per *line*, not per word. Lines only exist
after layout, so wrap each word, read `offsetTop`, group the words that share
one, then rewrap. And wait for `document.fonts.ready` or the grouping is
measured against the fallback face and regroups wrongly when the webfont lands.

**`08-preload-gate.html`** — ship it only when there is something real to
preload. A gate in front of a page that was already ready is a fake loading
screen and users can tell.
