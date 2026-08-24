Correct and continue the /systems/studio rebuild.

READ FIRST, in this order — all in the repo, all committed:
  docs/studio-reference/CATALOGUE.md    START HERE. Its top section is a
                                        correction to what is live right now.
  docs/studio-reference/README.md       token contract + build order
  docs/studio-reference/contract.css    the whole design system
  docs/studio-reference/01..13-*.html   working reference implementations

Every HTML file opens directly in a browser with no build step. Each has one
<style> block and one <script> block marked THE COMPONENT; everything else in
the file is harness and is labelled. Open one, use it, port it. Do not
reinterpret it, and do not rebuild its behaviour from the description.

This pass CORRECTS stage (a). It is a replacement, not an increment. Nothing
below is a criticism of that work — it was built against an earlier brief,
before the reference files, contract.css, the six sections and the iframe
bridge existed.

────────────────────────────────────────────────────────────────────────────
1. REPLACE THE REGISTRY — DO NOT MERGE THE TWO LISTS
────────────────────────────────────────────────────────────────────────────
The live registry has 16 entries. Of those:

  KEEP AS-IS (3)      Modal · Dropdown · Drawer

  RENAME (5)          Line Reveal      -> Split-text line reveal   (ref 10)
                      Loading Splash   -> Preload gate             (ref 08)
                      Cursor Response  -> Custom cursor            (ref 13)
                      Progress Scrub   -> Scroll-pinned act
                      Primary Button   -> Pill button              (ref 01)
                      Rename the registry entry, the heading AND the import
                      path so all three agree.

  REMOVE (7)          Icon Button · Segmented Control · Disclosure Rail ·
                      Range Control · Toast · Word Scrub · Start Menu
                      None of these appear on gsap.com, activetheory.net or
                      santionispirits.com.

  ARGUE OR REMOVE (1) Age Gate. Santioni is a spirits brand and spirits sites
                      gate by age. If you took it from there, say so and keep
                      it. If it was invented to fill a slot, remove it.

Then load the full 23-slot list from CATALOGUE.md §2. Merging the old and new
lists produces a catalogue of 39 where eight entries have no traceable origin.
Replace.

RULE GOING FORWARD: the component count is an OUTPUT of the list, never an
input. If a component cannot be traced to something observed on a named site
or to a real client-build need, it does not go in the registry — not even as
Planned.

────────────────────────────────────────────────────────────────────────────
2. REPLACE THE PALETTES
────────────────────────────────────────────────────────────────────────────
Live: Paper / Ink, Night / Signal, Clay / Moss, Cobalt / Sand.
Should be the four in contract.css, with those exact values:

  ember    dark,  hot accent,      radius 6px
  venue    dark,  high-energy,     radius 22px
  gallery  LIGHT, soft violet,     radius 14px
  clinic   LIGHT, teal, near-square, radius 3px

Two are light grounds on purpose. That is the acceptance test: a component
that only works on dark is not finished.

────────────────────────────────────────────────────────────────────────────
3. ONE PALETTE SWITCHER, NOT SEVENTEEN
────────────────────────────────────────────────────────────────────────────
There are currently 17 palette controls on the page — one per card plus one at
the top. Remove the per-card ones. There is exactly ONE sticky page-level
control, in a bar that sticks under the site header alongside the section jump
links.

Switching a single card proves nothing. Switching every component on the page
at once, including the embedded references, IS the demonstration. This is the
most important control on the page; it must never scroll out of reach.

────────────────────────────────────────────────────────────────────────────
4. SIX SECTIONS
────────────────────────────────────────────────────────────────────────────
Controls · Navigation · Overlays · Type motion · Layout · Experience

`Thresholds` goes — nothing on the reference sites is a threshold, and the
section was collecting whatever did not fit. Membership is in CATALOGUE.md §2.

────────────────────────────────────────────────────────────────────────────
5. FILL THE EMPTY STAGES TODAY — BEFORE ANY PORTING
────────────────────────────────────────────────────────────────────────────
Every card currently reads "Reference implementation next". Thirteen of them
do not have to.

  a. Copy docs/studio-reference/ to public/studio-reference/. Keep docs/ as
     the source of truth; treat public/ as a build copy (a prebuild script is
     fine). Files then serve at /studio-reference/04-mega-menu.html.

  b. Each card with a reference embeds it in an iframe, loading="lazy".

  c. The harness in every reference file already speaks to a parent:

       frame.contentWindow.postMessage({ studioChrome: "off" })
           strips the reference file's own header and palette bar so the
           card supplies the chrome

       frame.contentWindow.postMessage({ studioPalette: "venue" })
           driven by the ONE page-level control from §3

     and each file posts { studioHeight } back on load and resize:

       addEventListener("message", e => {
         if (e.data?.studioHeight) frame.style.height = e.data.studioHeight + "px"
       })

This puts 13 components live and playable on the next deploy, with the palette
switch working across all of them, before a line of React is written.

────────────────────────────────────────────────────────────────────────────
6. STATUS CHIPS — FOUR STATES
────────────────────────────────────────────────────────────────────────────
  Built      native React component, importable      -> the real component
  Reference  working, running from the static file   -> the iframe
  Planned    on the roadmap, not written yet         -> dimmed empty stage
  Ad hoc     deliberately NOT on the roadmap         -> its reference if one
                                                        exists, else dimmed

Semantic colours, NOT the brand accent — the accent belongs to the components
being demonstrated and a chip competing with it muddies the whole point.

Header readout above the sections, computed from the registry, never
hand-typed:  0 built · 13 reference · 5 planned · 5 ad hoc

────────────────────────────────────────────────────────────────────────────
7. CARD ANATOMY AND GRID
────────────────────────────────────────────────────────────────────────────
  header strip   component name left, status chip right. Nothing else.
  stage          the live instance. Minimum 320px tall, and the largest thing
                 on the card.
  footer         one line on what it does, written for a person. Then the
                 import path in mono (click to copy), and a link to the
                 reference file.

Two columns on desktop. These span BOTH: mega-menu, marquee band, block
inversion, preload gate, scroll-pinned act, split-text, display statement.
Compact ones take one column. Single column under 900px.

A component that needs width gets width. Three assets in a section means three
different components — never one preview reused under three labels.

────────────────────────────────────────────────────────────────────────────
8. BUILD ORDER — THERE IS NO STAGE 3
────────────────────────────────────────────────────────────────────────────
Stage 1  pill button · text-roll button · magnetic button · filter chip row ·
         search field · dropdown · modal · block-inversion wrapper
Stage 2  mega-menu · nav link set · full-screen menu · drawer · split-text
         reveal · display statement · stacked label · marquee band ·
         draw-on SVG

The Experience section (preload gate, page-transition shell, custom cursor,
sound bus, scroll-pinned act) is Ad hoc. DO NOT PORT ANY OF IT. Its cards stay
on the page and three of them keep showing their references, but they carry
the Ad hoc chip. Ad hoc means built per project, on request.

STOP after §1–§5 and show me the page with the registry replaced, one palette
switcher, and 13 live embedded references. Do not start stage 1 until I have
seen that.

────────────────────────────────────────────────────────────────────────────
9. THE CONTRACT — 16 TOKENS
────────────────────────────────────────────────────────────────────────────
  --brand --brand-ink --surface --surface-2 --line --text --text-dim
  --radius
  --font-display --font-body --font-mono
  --dur-fast --dur --dur-slow --ease --ease-io

Six of these are new since stage (a) and the change is purely additive. Port
the values from contract.css into the studio theme file.

Block inversion: `--surface: var(--text); --text: var(--surface)` is a CYCLE
and both properties go invalid. Each palette declares two private anchors,
--_ground and --_ink, that are never redefined; only the invert rule reads
them. Do not use them inside a component.

Forbidden inside any component: literal colours, hard-coded ms or easing
curves, glass-surface / cw-button-flow / retro-grid-bg / hover-bloom /
cw-ring-accent, text-primary / bg-card / border-border, anything imported from
the avint app.

────────────────────────────────────────────────────────────────────────────
10. EVERY COMPONENT
────────────────────────────────────────────────────────────────────────────
- one component per file under components/studio/, single export plus types
- no barrel file
- must paste into a fresh Next.js project with only the token block and compile
- visible :focus-visible state
- honours prefers-reduced-motion
- keyboard operable; Escape closes overlays; Tab trapped in modals
- no layout shift on hover
- animate transform and opacity; animate width/height only where a reference
  file does it (04-mega-menu, and it explains why)

THREE THAT ARE EASY TO GET WRONG — the reference files carry the detail:
  04-mega-menu   measure the panel at its TARGET width with the transition
                 suppressed, or it opens with dead space at the bottom. The
                 notch is a SIBLING of the panel, not a child.
  10-split-text  masked per LINE not per word; wait for document.fonts.ready;
                 pad the mask below the baseline or it shears descenders.
  11-stacked     back layers are TINTS OF --brand, never --text-dim/--line,
                 and the settled offset must stay visible.

────────────────────────────────────────────────────────────────────────────
11. NOT IN SCOPE
────────────────────────────────────────────────────────────────────────────
No WebGL, no Three.js, no custom typefaces, no bespoke line art, no sound
files. Those are per-project set pieces, costed separately. The library
provides the stage they drop into, never the content.
