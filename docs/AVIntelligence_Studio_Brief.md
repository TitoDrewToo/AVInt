# AVIntelligence — Studio Capabilities & Portfolio Brief

*Internal studio brief. Doubles as the raw material for an external one-pager/pitch — trim to studio + capabilities + the one or two portfolio pieces most relevant to a given prospect.*

---

## The studio
AVIntelligence is a solo systems-development and consulting studio run by **Andrew Vincent**. It designs, builds, and ships production web applications, internal tools, and AI-automation systems — fast and lean — by orchestrating AI across the entire delivery loop. It is both a person and a brand: the studio ships its own products and takes on external client work.

## How the studio works (the differentiator)
AVIntelligence delivers agency-grade software at solo speed and cost by running a disciplined, AI-orchestrated loop:
- **Direction, spec, prototype, and review** — Andrew with Claude: planning, architecture, design prototyping, code review, and security audit.
- **Build legwork** delegated to coding agents (Codex).
- **Research and analysis** via specialized tools.

A human stays on the high-value decisions — *what to build, is it correct, is it safe* — while the legwork is automated. The result is shipping in days what typically takes weeks, without giving up production discipline.

## What it builds
- Custom web applications — SaaS, dashboards, catalogues, storefronts
- Internal tools and role-gated admin systems
- AI-powered features — document extraction, triage, generation
- AI-automation systems and workflow integrations
- Data-backed dashboards and reporting
- Systems architecture, security hardening, and observability

## Stack
Next.js · React · TypeScript · Supabase (Postgres, RLS, Auth, Storage, Edge Functions) · Vercel · WebGL / GLSL / Three.js for interactive visuals · payment integrations (Creem, Stripe) · AI APIs (Anthropic and others). Open-source-first and cost-conscious — runs on free/low tiers wherever possible.

The studio web architecture and future-project tech direction live in [`docs/AVIntelligence_Studio_Architecture_Tech_Stack.md`](./AVIntelligence_Studio_Architecture_Tech_Stack.md). That document extends this capability brief with the creative rendering, GSAP-inspired interaction system, motion, media, performance, QA, and handoff standards. It is intentionally separate from the Smart Storage and universal workflow data architecture handoffs.

---

## Portfolio

### avint — AVIntelligence Smart Storage & Dashboard  ·  flagship product  ·  avintph.com
A document-intelligence SaaS for the US market that turns messy financial and operational documents into structured, reportable data.
- **Smart Storage** — upload receipts, invoices, payslips, contracts → AI extraction into structured fields, behind a safety prescan gate.
- **Reports** — IRS Schedule C tax bundle, P&L, income/expense summaries, contract key-terms; with QuickBooks and Xero CSV export.
- **Smart Dashboard** — interactive analytics with AI-narrated insights.
- **Under the hood** — value-based subscription tiers with atomic usage metering, server-side entitlement enforcement, and a self-diagnosing error-monitoring + AI-triage system.

*Demonstrates:* full-stack product ownership, real tax/report domain logic (135+ tested cases), payments, and production observability.

### Chroma Fairy — art catalogue & studio  ·  first external client  ·  chromafairy.vercel.app
A catalogue and operations studio for fluid-abstract artist Samantha Ty — from zero to presentable in about two weeks.
- **Public** — animated storefront with SEO, product pages, and inquiry + commission flows.
- **Studio (role-gated admin)** — works catalogue with drag-drop image management, atomic sales/orders, a customer CRM, availability & booking, insights, and an error-monitoring layer.
- **Signature** — a custom WebGL "living painting" background built from the artist's own works: a scroll-driven morph across her collection.

*Demonstrates:* client delivery, e-commerce + CRM, RLS security, atomic transaction design, and high-craft interactive/motion design.

### Hooper & PicklePal — mobile apps  ·  earlier work, currently shelved
Two mobile applications built prior to the current studio workflow — useful for range/portfolio, not active projects.

---

## Signature strengths (evidenced by the work above)
- **Production discipline** — RLS as the real security boundary, atomic status-guarded transactions, structured observability, a security-review pass before ship.
- **Speed without shortcuts** — agency-scope builds in days-to-weeks, solo.
- **Design & motion craft** — bespoke WebGL/GLSL backgrounds and reel-tier interactive UI.
- **Systems thinking** — self-diagnosing monitoring, adaptive AI-triage, centralized enforcement over duplicated logic.
- **Commercial sense** — value-based pricing, positioning, and go-to-market, not just code.

## Working with AVIntelligence
A fit for founders, small businesses, artists, and teams who need a custom web app, internal tool, or AI automation shipped quickly and correctly — without agency overhead. Engagements range from one-off builds to ongoing product partnership.

**Contact:** Andrew Vincent · avinnilooban@outlook.com
