Stage 1 verified. Four corrections before Stage 2 — none of them large.

I checked your report against the files rather than taking it at face value.
It was accurate: 23 registry entries (8 Built / 5 Reference / 5 Planned /
5 Ad hoc), six sections, the exact palette contract, one sticky switcher,
13 references in public/, and a clean contract scan — I ran my own grep for
hex literals, forbidden utilities and hard-coded easings, and it came back
clean. The modal is better than my reference: dismissing on the scrim's
mousedown rather than click avoids the drag-out-and-release bug. Good work.

Four things build, lint and grep cannot see.

────────────────────────────────────────────────────────────────────────────
1. THE MOTION TOGGLE IS A DEAD CONTROL FOR 8 OF 13 STAGES — my bug, fixed
────────────────────────────────────────────────────────────────────────────
Your catalogue posts { studioMotion: "on" | "off" } to every frame. That was
right. My reference harness never listened for it, so the toggle silently did
nothing to any embedded reference.

Fixed on my side. Re-copy docs/studio-reference/ to public/studio-reference/ —
all 14 files changed. The harness now sets data-motion on its own <html>, and
contract.css pauses animations rather than snapping them to their end frame
(a marquee that jumps to its final position reads as broken, not paused).

Verified end to end: the marquee's animation-play-state goes running ->
paused on message.

────────────────────────────────────────────────────────────────────────────
2. THE PALETTE RESETS WHEN YOU CHANGE SECTION
────────────────────────────────────────────────────────────────────────────
StudioThemeProvider is mounted inside StudioCatalogue, which is inside each
page. The section nav uses <Link>, which is a real navigation. So:

  pick Venue -> click "Overlays" -> you are back on Ember.

That breaks the one thing the page exists to demonstrate.

Fix it with anchors, not a provider hoist. The main page already renders all
six sections, and StudioCard already sets id={`studio-${asset.id}`}. Change
the nav from

  <Link href={`/systems/studio/${item.id}`}>

to an in-page anchor href={`#studio-section-${item.id}`}, and add the matching
id to each <section>. Add scroll-margin-top so the sticky bar does not cover
the heading.

Keep the /systems/studio/[section] routes — they are useful for deep links —
but they are the drill-in, not the primary way to move around. The whole point
is watching everything change at once, and that only works on one page.

If you would rather keep <Link> navigation, the palette has to survive it:
hoist the provider into app/systems/studio/layout.tsx AND persist the choice
(searchParam or localStorage), because a layout-level provider still remounts
on a hard navigation. Anchors are less machinery for a better demo.

────────────────────────────────────────────────────────────────────────────
3. app/globals.css IMPORTS FROM docs/
────────────────────────────────────────────────────────────────────────────
  @import "../docs/studio-reference/contract.css";

Two problems. The production CSS bundle now depends on a documentation folder
— editing a doc changes the build. And the studio tokens load on every page of
avintph.com, not just /systems/studio.

There are now three copies of the same file: docs/, public/, and this import.
Make one of them the source:

  - move it to styles/studio-contract.css — that is the build input
  - a prebuild script copies it to public/studio-reference/contract.css
  - docs/studio-reference/contract.css becomes a copy from the same script,
    or the doc links to styles/ instead of holding its own copy
  - import it from the studio route's own CSS entry, not app/globals.css, so
    it does not ship on the marketing pages

Scoping is already fine — every rule is under .studio, so nothing leaks. This
is about build coupling and bundle weight, not correctness.

────────────────────────────────────────────────────────────────────────────
4. THE CONTRACT IS NOW 18 TOKENS — my bug, fixed
────────────────────────------------------------------------------------────
magnetic-button.tsx carries duration-[520ms], which the contract forbids. You
copied it faithfully from my reference file, which broke my own rule. Mine to
fix, and it is fixed: contract.css now defines

  --dur-spring:  520ms
  --ease-spring: cubic-bezier(.16, 1, .3, 1)

A spring release is a genuinely different primitive from an entrance
(--ease) or a two-state travel (--ease-io), and exactly one component needs
it. Tokens beat a magic number. Update magnetic-button.tsx to use them, and
re-run your contract scan — it should stay clean.

────────────────────────────────────────────────────────────────────────────
ONE JUDGEMENT CALL, YOUR SHOUT
────────────────────────────────────────────────────────────────────────────
The sticky control bar is styled with studio tokens, so the page chrome
changes colour along with the components. It is defensible — a bolder demo —
but it means the reference frame moves while you are comparing palettes. I
would hold the chrome steady and let only the stages change. Tell me which you
prefer and I will not raise it again.

Minor: the modal's close control is a literal × glyph where the reference uses
an SVG path. × renders inconsistently across font stacks and does not scale
with the border box. Swap it for the SVG from 06-modal.html.

────────────────────────────────────────────────────────────────────────────
THEN
────────────────────────────────────────────────────────────────────────────
Commit and push. Then Stage 2:

  mega-menu · nav link set · full-screen menu · drawer · split-text reveal ·
  display statement · stacked label · marquee band · draw-on SVG

Three of those are the ones easy to get wrong — 04-mega-menu (measure at the
target width with the transition suppressed; the notch is a sibling),
10-split-text (masked per line, wait for document.fonts.ready, pad the mask
below the baseline), 11-stacked-label (back layers are tints of --brand, and
the settled offset must stay visible). The reference files carry the detail.

Stop after Stage 2. The Experience section stays Ad hoc — do not port it.
