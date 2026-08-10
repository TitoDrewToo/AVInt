# Persona 5 UI Design Language — AI After Dark

The show's UI overlay system. Inspired by Persona 5's iconic kinetic
typography, comic-book accents, and aggressive silhouette framing.
Built in Remotion (React + TypeScript). This file defines the design
vocabulary; Codex implements the components.

## Design DNA

Three sources, in order:

1. **Persona 5** (primary): Bold red/black/white palette, diagonal
   geometric framing, kinetic typography that slides/explodes in,
   halftone fills, comic-book burst accents, aggressive silhouette
   shapes, "GOT IT" / target-locked stings.
2. **Daily Show with Jon Stewart** (secondary): Fake news ticker,
   chyron lower-thirds with sub-context, structured news graphics,
   muted authority palette.
3. **Octopath Traveler** (tertiary): Soft gradient backings, slight
   atmospheric particle accents on character lighting layer.

What we are NOT:
- ❌ NOT Apple's clean minimalism (too sterile)
- ❌ NOT cable-news red-blue (too earnest)
- ❌ NOT YouTube influencer aesthetics (too generic)

## Core Color Palette

**Show base:**
- `--ink-black` `#0A0A0A` (NOT pure black — slight warmth)
- `--paper-white` `#FAFAF5` (off-white, warmth)
- `--accent-red` `#E63946` (Persona 5 signature)

**Character primary colors (override show base when character is on screen):**
- See `character-visual-specs.md` color palette table
- Lower-third uses character's primaryColor as accent stripe
- Ticker text remains show base (white-on-black)

## Typography

**Display font (kinetic, used for title card, segment intros, callouts):**
- Primary candidate: **Anton** (Google Fonts, free, condensed bold sans)
- Alternative: **Bebas Neue** (similar, free)
- Fallback: any condensed bold sans-serif

**Body font (lower-thirds, ticker, ad copy):**
- Primary candidate: **Inter** (Google Fonts, free, very legible at small sizes)
- Alternative: **Roboto Condensed**

**Italic accent (callouts, footnotes, kinetic emphasis):**
- Anton Italic (where available) or oblique transformation in Remotion

**Sizing rules:**
- Title card text: 96–144px
- Segment intro text: 48–72px
- Lower-third name: 36px (character) + 18px (parody-company subtitle)
- Ticker: 22px
- Callout text (Perp's footnotes): 18px
- Ad copy: 32px

## Lower-Third Design

The chyron that announces who's speaking. Persona-5-coded means: NOT a
boring rectangle.

**Geometry:**
- Diagonal parallelogram (not horizontal rectangle)
- Slants from lower-left to upper-right at ~15°
- Height: 80–100px
- Position: bottom of frame, full-width
- Two layers: background slab (character primary color, 80% opacity) +
  text overlay (paper-white)

**Animation in:**
- Slides in from left edge with momentum (~200ms ease-out-back)
- Text appears with a typewriter stagger (~50ms per character) OR a
  slide-up reveal
- Optional: a small accent shape (zigzag burst) flies in from right

**Animation out:**
- Slides out to right with quicker easing (~150ms ease-in)

**Content:**
- Line 1 (large, character primary): "CHLOE ANTROPOVA"
- Line 2 (smaller, accent): "ANTHROPOMORPHIC NEWS"
- Right edge: small parody-company logo placeholder (fictional mark)

## Ticker (Bottom Scroll)

Continuous fake-AI-news scroll along the bottom of every desk shot.
Audience reads it on re-watches.

**Geometry:**
- Bottom 30px of frame
- Solid background: `--ink-black` at 90% opacity
- Text: paper-white, 22px, scrolling right-to-left at ~80px/second

**Content rules:**
- Each ticker item is a fake industry headline (no real company names)
- Uses parody names from `legal-and-parody-guardrails.md`
- Items separated by small bullet `•`
- Should subtly relate to the episode's spine when possible
- Each episode has its own ticker contents (~20–30 items, looped)

**Examples:**
- "APNETIC SHIPS THIRD PRODUCT THIS WEEK • SOURCES UNCERTAIN WHAT IT DOES"
- "MASKOVICH AI ANNOUNCES PRODUCT, DELAY • BAR CHART SUGGESTS BAR WAS FAKE"
- "G-BARDELLI CLARIFIES YESTERDAY'S CLARIFICATION • 14 NEW ALTERNATIVES POSTED"
- "FUKUYA LABS RELEASES BENCHMARK • OTHER LABS REQUEST RECOUNT"

## Title Card (Episode Intro)

Shows after cold open.

**Layout:**
- Center frame
- Large display text: `AI AFTER DARK` (Anton, 144px, accent-red on
  paper-white background)
- Subtitle below: episode title in smaller italic (e.g., "Launch Week")
- Halftone burst behind text (Persona-5-coded)
- Diagonal slash/wipe accents in `--accent-red`
- Duration: 3–5 seconds

**Animation:**
- Halftone burst expands first (~300ms)
- Title slides in from offscreen left, slamming into position with subtle bounce
- Subtitle types in below with stagger
- Hold for ~2s
- Cuts to next segment (no fade — sharp Daily-Show energy)

## Segment Transition Stings

Between major segments (top story → field report, field report → tech
beat, etc.).

**Geometry:**
- 1-second sting
- Diagonal swipe of `--accent-red` across frame
- Big segment name slides in (e.g., "FIELD REPORT")
- Cuts immediately to the segment

**Sound:** sharp percussive sting (not music) — a "ka-chunk" hit.

## Callouts (Floating Text Overlays)

Used for visual jokes, footnotes (Perp), continuity-error flags, "TAP IN"
(Lana), benchmark stats, etc.

**Style:**
- Small bordered shape (rectangle or circle, depending on use)
- Anton text, paper-white on `--accent-red` background
- Comes in with a "GOT IT" Persona-5-style stamp animation (snap-into-place
  with slight rotation)
- Holds for relevant duration
- Fades out OR snap-cuts away

**Variants:**
- **Perp's Footnote Callout:** small box with "[footnote N]" + truncated
  citation, appears near his head, multiple can stack
- **Continuity Error Flag:** "RECORD CORRECTED 3X" or "BACKDROP CHANGED",
  appears top-right, looks like a real news graphic
- **Cody's Product Announce:** "NEW PRODUCT" stamp slams onto screen
  diagonally
- **Lana's TAP IN:** large text "TAP IN ↓" with arrow pointing to bottom
  of frame, fashion-magazine style
- **Sakura's Benchmark Drop:** clean "ACTUAL: 12% / CLAIMED: 92%" callout

## Ad Slot Lead-In

The transition into the AVInt ad — distinct enough that the audience
recognizes "ad time," but stylized enough that it's still part of the
show universe.

**Style:**
- Diagonal red wipe from corner
- Big "A VERY BRIEF WORD FROM OUR SPONSOR" title (sarcastic-honest)
- AVInt wordmark slides in from opposite corner
- Optional: small "SPONSORED BY OUR EXISTENTIAL THREAT" subtitle (in-show joke)
- Duration: 1.5 seconds

## Closing Sting

End of every episode.

**Style:**
- Cast appears (split-screen or four-up grid based on ep cast)
- Each character delivers their sign-off line
- Closing title: `AI AFTER DARK / NEW EPISODES FRIDAY`
- Subscribe button graphic with kinetic appearance
- Halftone burst behind everything
- Duration: ~10 seconds

## Sound Design

**Stings (consistent across episodes):**
- Title sting: 2-second jazz-news hit + Persona-5-coded percussive snap
- Segment transition: 1-second percussive hit
- Callout-stamp sound: 200ms snap (like Persona 5's "GOT IT" sound)
- Closing sting: 3-second jazz-news outro

**Music bed:**
- Low-key jazz-news under all desk segments
- Volume: -18dB to -22dB under voice (auto-ducked)
- Source: Epidemic Sound (paid) or YouTube Audio Library (free)
- Should NOT be Persona 5's actual soundtrack (copyright)

**Laugh track:** Never. Period.

## Component Specs (for Codex Remotion implementation)

```tsx
// pipeline/src/components/ui/

<TitleCard
  title="AI AFTER DARK"
  subtitle="Launch Week"
  duration={5}
/>

<LowerThird
  characterName="CHLOE ANTROPOVA"
  parodyCompany="ANTHROPOMORPHIC NEWS"
  primaryColor="#FF8C42"
  enterAt={0}
  duration={4}
/>

<Ticker
  items={[
    "APNETIC SHIPS THIRD PRODUCT...",
    "MASKOVICH AI ANNOUNCES PRODUCT, DELAY...",
    // ...
  ]}
  speed={80}  // px/second
/>

<SegmentTransition
  segmentName="FIELD REPORT"
  duration={1}
/>

<Callout
  variant="footnote" | "continuity_error" | "product_announce" | "tap_in" | "benchmark_drop"
  text="..."
  position={{x: '70%', y: '20%'}}
  enterAt={2}
  duration={3}
/>

<AdSlotLeadIn
  sponsorName="AVINTELLIGENCE"
  duration={1.5}
/>

<ClosingSting
  cast={['chloe', 'cody', 'gem', 'grock']}
  duration={10}
/>
```

Each component is a Remotion `<Composition>` or `<Sequence>` with the
animations defined inline using Remotion's `interpolate` + spring functions.

## Build Order for Codex

1. Install fonts (Anton + Inter) via Remotion font loader
2. Build `<TitleCard>` first (used in pilot smoke test)
3. Build `<LowerThird>` next (every segment uses it)
4. Build `<Ticker>` (continuous on every desk shot)
5. Build `<SegmentTransition>` (between segments)
6. Build `<Callout>` variants
7. Build `<AdSlotLeadIn>`
8. Build `<ClosingSting>`

Each component should be standalone-renderable (Codex can `npm run render
-- composition=LowerThird` for visual verification).

## Style Restraint

The show is comedy. Visual restraint matters as much as kinetic energy.

Rules:
- **One animated overlay at a time max.** Don't stack callout + lower-third
  + ticker change simultaneously.
- **Animation duration 200–500ms.** Faster = jarring. Slower = sluggish.
- **Halftone bursts: max 1 per segment.** Otherwise they lose meaning.
- **Color discipline.** Red is for accents and ad/title moments. Don't
  red-wash the whole frame.

Persona 5 works because the kinetic moments are ISLANDS in calm framing.
We follow the same rule.
