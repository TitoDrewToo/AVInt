# Chroma Fairy Product Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first AVIntelligence portfolio page for Chroma Fairy that follows the existing Smart Storage product-page structure while presenting the shipped art-site build through concise, craft-led copy.

**Architecture:** Add a single App Router page at `/products/chroma-fairy` using the existing `Navbar`, `Footer`, `Button`, and marketing section classes. Omit the brief’s living-hero sample and screenshot gallery until real assets exist; use a restrained static visual panel made only from CSS gradients and labeled build outcomes. Keep the page free of new custom keyframe or scroll animations.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, existing AVIntelligence marketing components, JSON-LD.

---

### Task 1: Add the portfolio product page

**Files:**
- Create: `app/products/chroma-fairy/page.tsx`

- [ ] Add metadata, JSON-LD, navbar, hero, design highlights, build highlights, asset-pending note, and external CTA links.
- [ ] Reuse the Smart Storage spacing and glass-surface patterns without adding hard animations or invented screenshots.
- [ ] Run `npm run build` and confirm `/products/chroma-fairy` is generated.

### Task 2: Verify locally

**Files:**
- Verify: `app/products/chroma-fairy/page.tsx`

- [ ] Start the AVIntelligence dev server and inspect `/products/chroma-fairy` on localhost.
- [ ] Confirm the live-site and commission CTAs point to `https://www.chromafairy.com/` and `https://www.chromafairy.com/#contact`.
- [ ] Leave all unrelated worktree changes unstaged and uncommitted.
