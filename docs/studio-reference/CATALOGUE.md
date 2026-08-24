# /systems/studio — page design and population plan

This supersedes the current four-section catalogue. Read `README.md` first for
the token contract; this file is about the page itself.

---

## READ THIS FIRST — the live registry has to be replaced, not extended

What is live on `/systems/studio` today registers sixteen components:

> Primary Button · Icon Button · Segmented Control · Disclosure Rail ·
> Range Control · Modal · Dropdown · Drawer · Toast · Line Reveal ·
> Word Scrub · Cursor Response · Progress Scrub · Loading Splash ·
> Start Menu · Age Gate

They break down three ways:

**Match the spec already (3)** — Modal, Dropdown, Drawer. Keep as-is.

**Are spec components under a different name (5)** — rename to the spec name so
the reference file, the registry entry and the import path agree:

| Live name | Spec name | Note |
|---|---|---|
| Line Reveal | Split-text line reveal | ref `10` |
| Loading Splash | Preload gate | ref `08`, now `Ad hoc` |
| Cursor Response | Custom cursor | ref `13`, now `Ad hoc` |
| Progress Scrub | Scroll-pinned act | `Ad hoc` |
| Primary Button | Pill button | ref `01` — and it is a *variant*, not a component |

**Have no provenance (8)** — Icon Button, Segmented Control, Disclosure Rail,
Range Control, Toast, Word Scrub, Start Menu, and Age Gate. None of these
appear on gsap.com, activetheory.net or santionispirits.com. They were
generated to reach a slot count.

One of the eight is worth arguing for rather than deleting: **Age Gate.**
Santioni is a spirits brand and spirits sites gate by age — if that was
inferred from the reference rather than invented, it has real provenance and a
real client use. Say where it came from and it can stay. The other seven come
out.

None of this is a criticism of the work. The earlier brief asked for "16
registered assets" without naming them, so a list got generated to reach
sixteen. That was a fault in the brief, and it is corrected here: **the count
is an output of the component list, never an input to it.**

**Replace the registry with the twenty-three below. Do not merge the two
lists** — merging produces a catalogue of thirty-nine where nobody can say
where eight of them came from, which is the exact failure the admission rule in
§6 exists to prevent.

Three other things diverge from this spec and need correcting in the same pass:

| Live now | Should be |
|---|---|
| Four palettes named Paper / Ink, Night / Signal, Clay / Moss, Cobalt / Sand | The four in `contract.css`: `ember`, `venue`, `gallery`, `clinic`, with those exact values. Two of them are light grounds — that is the acceptance test. |
| A palette switcher on every card (seventeen on the page) | **One** sticky page-level control. Switching a single card proves nothing; switching all of them at once is the entire demonstration. |
| Four sections including `Thresholds` | The six in §2. |
| Every stage empty — "Reference implementation next" | Thirteen of them have working references that can be embedded today. See §1. |

The page has one job: **prove the library is brand-agnostic to someone who
does not trust that claim.** Everything below serves that. A list of component
names does not do it. A grid of live instances that all change colour together
when you press one button does.

---

## 1. Make the references live immediately

The thirteen files in this folder are already working, interactive, and
palette-switchable. Do not wait for the React port to put them on the page.

**Copy this folder to `public/studio-reference/`** (keep `docs/` as the source
of truth; treat `public/` as a build copy, or add a small prebuild script). The
files then serve at `/studio-reference/04-mega-menu.html`.

Each catalogue card embeds its reference in an `<iframe>`. The harness in every
reference file already supports this:

```js
// strip the reference file's own header and palette bar — the card supplies chrome
frame.contentWindow.postMessage({ studioChrome: "off" }, location.origin)

// drive it from the page-level palette control
frame.contentWindow.postMessage({ studioPalette: "venue" }, location.origin)
```

and each file posts its content height back so the card can size to fit:

```js
addEventListener("message", e => {
  if (e.data?.studioHeight) frame.style.height = e.data.studioHeight + "px"
})
```

This gets all thirteen playable on `/systems/studio` **on the next deploy**,
with the palette switch working across every one of them. As each component is
ported to React, its card swaps the iframe for the native component and its
status chip changes. Nothing else about the card changes.

`loading="lazy"` on every frame. Thirteen iframes is fine; thirteen eagerly
loaded animating iframes is not.

---

## 2. Sections — six, not four

`Thresholds` goes. Nothing on gsap.com or santionispirits.com is a threshold,
and it was collecting anything that didn't fit — which is how a catalogue stops
describing its library.

| Section | What belongs here | Components |
|---|---|---|
| **Controls** | Things a person presses | pill button · text-roll button · magnetic button · filter chip row · search field |
| **Navigation** | Getting from one place to another | mega-menu · nav link set · full-screen menu |
| **Overlays** | Things that sit on top of the page | dropdown · modal · drawer |
| **Type motion** | Type behaving as a moving element | split-text reveal · display statement · stacked label · draw-on SVG |
| **Layout** | Structure that other components sit inside | block inversion · marquee band · editorial grid |
| **Experience** | **Ad hoc — not on the roadmap.** Specced per project when a build actually needs it | preload gate · page-transition shell · custom cursor · sound bus · scroll-pinned act |

Each section carries one line explaining what it is for — not a description of
the components, a description of the *job*.

### Experience is a shelf, not a queue

Nothing in that section gets ported to React on a schedule. Three of the five
already have working references (`08`, `13`) and they **stay on the page** —
they cost nothing to keep, they are the best demo material we have, and they
show a prospective client what the experience layer can be without committing
us to maintaining five components nobody has asked for.

What was dropped is the commitment to build them. When a project needs one, we
capture a fresh reference against that project's brief and build it then —
which is also when we will know what it actually has to do. A preload gate
built speculatively is a fake loading screen; a preload gate built because a
site has 40MB of imagery to stage is a real one.

---

## 3. Card anatomy

The rev-1 failure was three assets rendering one identical box under three
labels. The structural fix is that **cards are not all the same size**, because
the components are not all the same size.

```
┌──────────────────────────────────────────────────────┐
│  Mega-menu                              [ Reference ]│  header strip
├──────────────────────────────────────────────────────┤
│                                                      │
│                  live instance                       │  stage — min 320px
│                                                      │
├──────────────────────────────────────────────────────┤
│  Opens on click, morphs between triggers on hover.   │  one line, plain
│  components/studio/MegaMenu.tsx            source ↗  │  import path · origin
└──────────────────────────────────────────────────────┘
```

- **Header strip** — component name left, status chip right. Nothing else.
- **Stage** — the live instance, minimum 320px tall, and it is the largest
  thing on the card. No border between stage and card edge.
- **Footer** — one line on what it does, written for a person, not a spec.
  Then the import path in mono (click to copy), and a link to the reference
  file.

**Grid:** two columns on desktop, and these span both —
mega-menu, marquee band, block inversion, preload gate, scroll-pinned act,
split-text, display statement. Compact ones (buttons, chips, dropdown, search)
take one column. Single column under 900px.

That variation is not decoration. A component that needs width gets width, and
the page stops looking like a spreadsheet.

---

## 4. Status chips

Three states. Semantic colours, **not** the brand accent — the accent belongs
to the components on the page, and a chip competing with it muddies the demo.

| Chip | Means | Card shows |
|---|---|---|
| `Built` | native React component, importable today | the real component |
| `Reference` | working, but running from the static reference file | the iframe |
| `Planned` | specified and on the roadmap, not written yet | a dimmed empty stage with the one-line description only |
| `Ad hoc` | deliberately **not** on the roadmap — built per project | its reference if one exists, otherwise the dimmed stage |

Planned and Ad hoc cards both stay visible, and the difference between them is
the point: `Planned` is a promise, `Ad hoc` is a capability. Someone reading the
page should be able to tell which components they can have next week and which
ones are a conversation.

Header readout, above the sections: `0 built · 13 reference · 5 planned ·
5 ad hoc`, computed from the registry, never hand-typed.

---

## 5. Page chrome

**Sticky control bar** — palette swatches and section jump links, in one bar
that sticks under the site header. The palette control is the single most
important thing on this page; it must never scroll out of reach. Pressing a
swatch changes every instance on the page at once, iframes included.

**No large hero.** Eyebrow, title, one sentence, the readout, then straight
into the controls. The components are the hero.

**Motion pause.** A page carrying twenty-two animating components needs a
global pause toggle, not just `prefers-reduced-motion`. Put it in the control
bar next to the palette. It sets `data-motion="off"` on the page root and posts
the same to every frame.

**Deep links.** Every card gets an `id`; the jump links use it. Someone
reviewing one component should be able to send a link to it.

---

## 6. Population plan

### What earns a slot

Two gates, both required:

1. **Provenance** — it traces to something observed in a shipped site, or to a
   real need from a live client build. Not "this would be useful". The
   evidence log in `README.md` is the format: which site, what was seen, and
   whether it was observed directly or read about.
2. **Portability** — it renders under all four palettes, and it pastes into a
   fresh Next.js project with only the token block and compiles.

A component that fails either gate does not go in the catalogue, even if it is
already written.

### Where new components come from

In priority order:

**1 · Client extraction — the main line.**
Every client build ends with an extraction pass: anything built for that client
that would serve another one gets generalised back into the library. This is
the only source that *proves* a component was needed, because a real project
already needed it. Chroma Fairy and the pickleball venue are the first two.
Budget half a day at the end of each build; do not skip it, because the context
is gone a week later.

**2 · Reference capture — one session a quarter.**
Pick a site, open it, document what it actually does, build the reference, then
port. The rule that makes this work is the one that produced this folder: never
build from "inspired by". If it was not observed, it does not get specified.

**3 · Gap fill — last, and resist it.**
Components the roadmap implies but no client has asked for. This is where
component libraries go to die. The whole Experience section was gap fill, which
is why it is now `Ad hoc` rather than a build stage.

### Cadence

Two stages, not three. Stage 1 is eight components and is already a shippable
client site. Ship it, use it on the venue build, and let that build tell us
what stage 2 actually needs — the venue will want things this list has not
thought of, and will not want some of what is on it.

Nothing gets added to the roadmap because it would round the library out. It
gets added because a build needs it, or because we saw it working somewhere and
can say where.

### The anti-goal

**Component count.** Twelve that always work beat forty that half-work. The
palette switch is the only metric that matters: a component that fails it is
not built, whatever the registry says.
