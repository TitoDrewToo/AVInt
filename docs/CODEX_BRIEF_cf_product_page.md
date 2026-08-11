# Codex Brief — Chroma Fairy card + product page (build/design showcase)

Add **Chroma Fairy** to the AVIntelligence products grid and give it a dedicated product
page. Framing: this is a **design & build showcase** — "something we designed and built" —
NOT a SaaS product pitch. Impressive on **craft and design**; deliberately **light on tech
stack** (no framework lists, no "vibe coder" energy). Show the work, not the plumbing.

Context: Chroma Fairy (chromafairy / avint-built) is the live art site for painter
**Samantha Ty** — a living gallery with a WebGL "living painting" hero, a storefront +
checkout, a commission-booking flow, and a full private studio back-office. Present it as a
portfolio piece alongside PicklePal / Hooper.

## 1. Products grid card — `components/sections/products.tsx`
Add a 6th card (fills the empty slot):
- Name: **Chroma Fairy**
- Status: **live** (badge "Live") — it's a real, shipped site.
- Description (short, design-led, no stack): e.g.
  *"A living online gallery for painter Samantha Ty — where the artwork moves. Custom storefront, commissions, and a full studio back-office, designed and built end to end."*
- href: `/products/chroma-fairy` (internal product page). Include an external link to the
  live site on the product page itself.
- Icon: a small tasteful mark (reuse the existing icon pattern in this file).

## 2. Product page — `app/products/chroma-fairy/page.tsx`
Match the existing product-page structure/voice (see `app/products/smart-storage/page.tsx`):
`Navbar`, hero, sections, `Footer`, JSON-LD, animated `FadeUp`/`Stagger`.

Sections:
- **Hero** — name + one-line positioning: *"An art site that behaves like a painting."*
  Sub: *"A living online gallery for painter Samantha Ty — designed and built by
  AVIntelligence."* Primary CTA **Visit the live site** (external → the CF URL), secondary
  **Commission a piece** (external → CF commission page).
- **Living hero sample** — a small, moving sample of CF's hero (see "Living hero" options
  below). This is the centerpiece; it should feel alive, not a static image.
- **Design highlights** (outcome language, not tech):
  - *Living backgrounds* — the hero repaints itself; a different living scene loads each visit.
  - *Cinematic scroll* — the gallery moves like a camera through the work.
  - *Tactile detail* — interactions with a hand-made feel (e.g., the dissolve on the contact form).
  - *A daily verse* — a quiet, rotating scripture moment.
- **Build highlights** (what was built, still no stack):
  - A complete **storefront + checkout** for selling originals and prints.
  - A **commission booking** flow from inquiry to scheduling.
  - A full **studio back-office** — catalogue, sales, customers, scheduling, insights — a real
    operations system behind the art.
- **Screenshot gallery** — see assets below.
- **CTA** — Visit the live site.

Voice: short, confident, benefit/craft-led (like "Upload. Generate."). One tasteful line max
acknowledging it's fully custom-built; do NOT enumerate frameworks, databases, or APIs.

## Living hero — 3 options (owner to pick; flag tradeoffs before building)
- **A. Port the WebGL background** — lift CF's living-background component into a small,
  self-contained avint hero canvas (scaled, autoplaying, no scroll dependency). Truly
  "living," self-contained, best wow. Most work; watch perf (lazy-load, pause offscreen,
  respect `prefers-reduced-motion`).
- **B. Muted autoplay video/webm loop** — a short capture of the living hero. Lightest,
  perf-safe, "living-ish." Needs a capture asset.
- **C. iframe the live hero** — real and simplest, but loads the whole CF site (heavy,
  scroll/interaction quirks, cross-site). Least preferred.
Default recommendation: **B** now (perf-safe) with a "Visit the live site" CTA for the full
experience; upgrade to **A** if we want maximum wow and can afford the perf work.

## Assets needed (prerequisite — not yet created)
- Screenshots: living hero, gallery/collections, a work/shop detail, the commission flow,
  and (optional, **redacted/sample data only**) the studio back-office to prove build depth.
- If Living-hero option B: a short muted loop (webm/mp4) of the hero.
- I (Claude) can capture these from the live CF site on request; do not ship placeholder art.

## Accuracy & privacy guardrails
- Frame as **"designed and built by AVIntelligence"** for artist Samantha Ty — credit the artist.
- **No real customer/sales data** in any studio screenshot — use redacted or seeded sample views.
- Do NOT list the tech stack (frameworks/DB/APIs). Keep it craft-and-outcome focused.
- Everything stated must be real (storefront, commissions, studio all exist) — no aspirational features.

## Verify
- `npm run build` passes; card appears in the grid; `/products/chroma-fairy` renders with the
  living hero sample and CTAs; external links open the live CF site.
