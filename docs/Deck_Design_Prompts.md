# Deck Design Prompts (self-contained)

> Paste these into Claude to design the slides. Each is fully self-contained — no repo/Project
> file access needed. Two decks in the near-term pipeline: (1) Studio bespoke-builds deck (#25),
> (2) Smart Storage CPA-firm deck (#21).
> Shared brand direction: 16:9 slides; dark background with a retro-glow **red** accent;
> understated, high-craft, confident; generous whitespace; minimal text per slide; simple line
> icons; one clean flow diagram where noted. No pricing tables unless marked "illustrative."
> Deliver as a polished, downloadable slide deck.

---

## PROMPT 1 — Studio bespoke-builds deck (for prospective build clients)

> Design an 11-slide pitch deck (16:9) for **AVIntelligence Studio**, a solo, AI-orchestrated
> systems & web development studio that builds custom software for clients. Audience: founders,
> small businesses, and teams who need a custom app, internal tool, or automation. Tone:
> understated, confident, craft-led. Visual style: dark background, retro-glow red accent,
> lots of whitespace, minimal text, simple line icons. No pricing anywhere. Use exactly this
> content:
>
> **Slide 1 — Cover:** "AVIntelligence Studio". Subtitle: "Production software, built end to
> end — fast, and correct." Footer: avintph.com/studio · support@avintph.com
>
> **Slide 2 — Who we are:** A solo, AI-orchestrated systems & web development studio. We ship
> our own products and take on client builds. Agency-grade work at solo speed, without the
> agency overhead.
>
> **Slide 3 — The problem:** Teams need custom apps, tools, and automations that fit how they
> actually work. Agencies are slow and expensive; off-the-shelf forces you to bend to it. The
> manual work in between — reviewing, sorting, chasing, notifying — quietly eats hours weekly.
>
> **Slide 4 — How we work (differentiator):** A human stays on the high-value calls — what to
> build, is it correct, is it safe — while an AI-orchestrated loop handles the legwork. Ship in
> days-to-weeks. Everything production-grade: real access control, atomic transactions, security
> review, self-diagnosing monitoring.
>
> **Slide 5 — What we build (5 capability cards with icons):**
> 1. Bespoke web apps & storefronts — catalogues, storefronts, dashboards, sites as one system.
> 2. Custom ingestion → intelligence systems — turn documents/forms/data into structured output
>    (any workflow, not just finance).
> 3. Internal tools & operations — role-gated workspaces so teams run on structure, not
>    spreadsheets.
> 4. AI workflow automation — pipelines that validate, score, route, act, then write back and
>    notify.
> 5. Interactive & motion design — custom WebGL and reel-tier interaction when it matters.
>
> **Slide 6 — Spotlight: AI workflow automation (hero slide with a left-to-right flow diagram):**
> The pattern: review/validate → decide → record → notify — put an AI where a human bottleneck
> sits. Case — a partner-onboarding review: reads applications from a spreadsheet; an AI
> validates ID, authority, entity, and role documents (with image-quality checks so it never
> guesses from an unreadable file) and scores each 0–100 with a decision and reviewer notes;
> decisions are written back and applicants emailed automatically. Flow diagram nodes:
> **Spreadsheet → AI validation → parse → record + build email → send.**
>
> **Slide 7 — Proof / portfolio (2 cards):** Chroma Fairy — a living online gallery: animated
> storefront + e-commerce + CRM + role-gated studio + a custom WebGL "living painting", zero to
> presentable in ~2 weeks. Smart Storage — a document-intelligence SaaS: ingestion, AI
> extraction, reporting, and a dashboard; our own flagship.
>
> **Slide 8 — Stack & discipline:** Next.js · React · TypeScript · Supabase · Vercel ·
> WebGL/Three.js · Creem/Stripe · AI APIs. Privacy: built on commercial/paid API terms that
> prohibit model training; data retained only briefly for abuse-monitoring, then deleted; RLS as
> the real boundary; PII minimization; 1-click delete.
>
> **Slide 9 — Engagements:** From one-off builds to ongoing product partnership. A partner who
> thinks about correctness, safety, and commercial sense — not just code. (No prices.)
>
> **Slide 10 — Why us:** Speed without shortcuts (agency scope in days-to-weeks, solo); design &
> motion craft; systems thinking (automation, observability); commercial sense.
>
> **Slide 11 — CTA:** "Have something you want built?" Start a project → support@avintph.com ·
> avintph.com/studio

---

## PROMPT 2 — Smart Storage CPA-firm deck (for accounting firms)

> Design a 10-slide pitch deck (16:9) for **AVIntelligence Smart Storage**, aimed at US
> accounting firms / CPAs / tax preparers. Goal: get firms to send a free co-branded intake link
> to their 1099 / self-employed clients before tax appointments. Tone: practical, credible,
> respectful of a busy firm's time. Visual style: dark background, retro-glow red accent, clean,
> minimal text, simple line icons, one flow diagram. Any monetary figures must be labeled
> "illustrative." Use exactly this content:
>
> **Slide 1 — Cover:** "Smart Storage for accounting firms". Subtitle: "Stop sorting shoeboxes.
> Get tax-ready Schedule C bundles before the appointment." Footer: avintph.com ·
> support@avintph.com
>
> **Slide 2 — The tax-season problem:** Every season, 1099 clients hand firms shoeboxes, messy
> Drives, and broken spreadsheets. Junior staff burn hours per client on low-margin manual data
> entry — unbillable under flat-fee pricing.
>
> **Slide 3 — What Smart Storage does:** Clients upload receipts and invoices to your firm's
> co-branded intake link before their appointment. AI extracts each document and maps it to IRS
> Schedule C. Your firm receives a clean, pre-mapped CSV plus an organized audit-evidence ZIP —
> with zero data entry.
>
> **Slide 4 — How it works (flow diagram):** **Your firm shares its link (avintph.com/cpa/your-
> firm) → client uploads receipts → AI extraction + Schedule C mapping → your firm receives CSV
> + audit ZIP.** Zero setup for the firm.
>
> **Slide 5 — What the firm gets:** No data entry. Line-items pre-mapped to Schedule C (including
> the 50% meals treatment). A 1-click audit-evidence ZIP — source PDFs foldered by Schedule C
> line with a manifest. Consistent, review-ready output across every client.
>
> **Slide 6 — The real hook (labor elimination):** This isn't about a referral check. It removes
> the ~200 hours of receipt sorting a firm eats each season, and hands staff clean, consistent
> inputs instead of shoeboxes.
>
> **Slide 7 — Ways to run it (illustrative):** (a) Referral — clients pay directly ($6 day pass
> or $12/mo), firm earns a referral share. (b) Wholesale seats — firm buys seats and bundles
> Smart Storage into its own intake/organizer fee. (c) Audit-protection add-on — firm offers a
> client audit-vault plan powered by the ZIP output. Mark all figures "illustrative."
>
> **Slide 8 — Security & trust:** Built on commercial/paid AI APIs that prohibit model training;
> data retained only briefly for abuse-monitoring, then deleted. Row-level security, PII
> minimization (tax metadata only), 1-click delete. Smart Storage is an organization tool — the
> firm and taxpayer retain final responsibility for filings (Circular 230). No overstated
> claims.
>
> **Slide 9 — Getting started:** Create your firm's co-branded link in minutes and send it to
> clients before their appointments. No software to learn, no setup.
>
> **Slide 10 — CTA:** "Give your clients a cleaner intake — and take the shoebox off your desk."
> support@avintph.com · avintph.com

---

### Notes
- After the full deck, you can ask for a **1-page PDF one-pager** version of either (trim the
  studio deck to slides 2, 5, 6, 7, 11; trim the firm deck to slides 2, 3, 5, 6, 10).
- Keep the honest guardrails intact: no fictional margins, no "never stored," no pricing on the
  studio deck.
