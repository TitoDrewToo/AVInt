# AVIntelligence Studio Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AVIntelligence Studio services page, expose it through the global navigation, and position Chroma Fairy as a client proof-of-work.

**Architecture:** Follow the existing product-page composition with `Navbar`, `Footer`, `HomeDefaultSphere`, `marketing-scroll-section`, `glass-surface`, `hover-bloom`, and `Button`. Keep the Studio page server-rendered with page metadata and embedded Organization/Service structured data; add the Chroma Fairy finale in its existing page without restructuring shared components.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Schema.org JSON-LD.

---

### Task 1: Add the Studio services page

**Files:**
- Create: `app/studio/page.tsx`

- [ ] Add typed metadata for the Studio page, including title, description, Open Graph, and Twitter fields.
- [ ] Add Organization and Service JSON-LD for AVIntelligence and the studio service offering.
- [ ] Build hero, four capability cards, How we work, two proof cards, and closing CTA sections using the existing marketing classes and exact requested copy.
- [ ] Keep all CTA links limited to `/studio`, `/products/chroma-fairy`, `/products/smart-storage`, and `mailto:support@avintph.com`; do not add pricing.

### Task 2: Add Studio navigation

**Files:**
- Modify: `components/navbar.tsx`

- [ ] Add a `/studio` link adjacent to Pricing in the desktop navigation.
- [ ] Add the matching `/studio` link adjacent to Pricing in the mobile menu.
- [ ] Preserve the existing typography, click handling, and menu close behavior.

### Task 3: Add the Chroma Fairy studio finale

**Files:**
- Modify: `app/products/chroma-fairy/page.tsx`

- [ ] Add the requested compact “The studio behind the build” section after “Built end to end.”
- [ ] Use `/studio` and `mailto:support@avintph.com` for the two requested actions.

### Task 4: Verify the change

**Files:**
- Test: `app/studio/page.tsx`, `components/navbar.tsx`, `app/products/chroma-fairy/page.tsx`

- [ ] Run formatting/diff checks.
- [ ] Run the production build and verify `/studio` and `/products/chroma-fairy` compile.
- [ ] Review the diff for exact copy, no pricing, and no unrelated changes.
