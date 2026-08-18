# AVIntelligence — Master Strategy

> Authored by Andrew (founder) + Claude (CTO / strategy lead). This is our canonical
> strategy doc — corrected and de-hyped. Supersedes the earlier raw Antigravity dump.
> Roles: Andrew = founder/direction. Claude = CTO/strategy/architecture/review.
> Codex = lead implementation. Perplexity/Gemini = research. ChatGPT/Gemini = image gen.
> Rule we hold ourselves to: no claim (margins, privacy, valuation) goes public unless it's
> literally true and defensible. Same discipline as our report math.

---

## 1. What we are

AVIntelligence is a solo, AI-orchestrated **systems & web development studio** that both ships
its own products and takes on client builds. Two revenue engines:

- **Smart Storage (SaaS)** — our flagship product and cash engine (US market).
- **Bespoke builds (services)** — custom web apps, internal tools, and AI systems for clients.
  Currently underrepresented on the site; being surfaced now (see §6).

Everything else (sports apps, estate, global structure) is downstream of these two working.

---

## 2. Smart Storage — the product & wedge

**Positioning:** the ingestion layer that turns messy financial/operational documents into
structured, reportable output — **instant IRS Schedule C tax bundle + 1-click audit-evidence
ZIP.** Not accounting, not tax advice. An organization/substantiation utility.

**Target (US only for now):** 1099 freelancers, solopreneurs, digital nomads, cross-border
contractors who need tax-season output without $400/yr double-entry software.

**Competitive void:**
- Legacy OCR (Dext/Hubdoc/Shoeboxed/Expensify): built for bookkeepers, $30–50/mo, no
  Schedule C mapping, no audit ZIP.
- Double-entry ERP (QuickBooks/Xero): over-engineered for solos; abandoned or dreaded.
- Consumer filers (TurboTax/TaxSlayer): compute a number in April; no year-round evidence
  vault or source-PDF storage mapped to Schedule C lines.
- No leader exists because incumbents chase high-ACV mid-market and their legacy stacks can't
  pivot to cheap multimodal-AI micro-pipelines fast.

**Pricing (decided):** $6 Day Pass · $12/mo Pro · wholesale firm seat ~$4/mo · audit-engine
seat ~$5/mo. **Checkout: Creem** (merchant-of-record; DB still labels it "lemonsqueezy" —
not worth refactoring). **Payouts:** currently PayPal on a US account; plan to move to a
nominated PH bank to kill the 3–4% FX markup.

---

## 3. Go-to-market — two sides of the street

**Direct-to-user (live):** freelancer buys the $6 pass or $12/mo Pro. Steady but acquired
one-by-one (content/SEO/communities).

**CPA / firm channel (the multiplier — next focus after the dev-angle):** free, zero-effort
co-branded intake link (`/cpa/[firm-slug]`). Client uploads before their appointment; firm
gets a clean Schedule C CSV + organized audit ZIP.

- **The real hook is labor elimination, not the referral check.** A $1,800/yr affiliate
  payout won't move a busy firm; "we take ~200 hrs of receipt-sorting off your desk this
  season" will. Wholesale/audit margin is the closer.
- **Execution:** Path A first (client pays; pass `referred_by_cpa` in Creem checkout metadata;
  webhook → Supabase — **no per-firm SKUs needed**). Path B later (firm pays; bulk-seat SKUs
  in Creem, prepaid client seats).
- **Model participation at 20–50%**; treat 80–100% (mandatory) as upside, not the base case.

---

## 4. Unit economics — honest version

- **Strong gross margins (~80%+), not 90–95% net.** Raw model token cost (~$0.003/doc) is only
  part of COGS; add image-input tokens to Gemini Vision, the normalization call,
  retries/dual-provider failover (sometimes paying twice), Supabase storage/egress, Vercel
  compute, Creem ~5% MoR, refunds, and founder time.
- **CAC is low, not zero.** The "CPA acquires everyone free" line only holds *after* a firm
  activates and enforces it; the effort to land + activate firms and maintain the portal is
  the real (low) CAC.
- For any deck/site: claim strong gross margins and cheap distribution — never fictional net
  margins or "zero CAC."

---

## 5. Security & privacy posture (defensible — verified Aug 2026)

Enterprise/commercial API terms differ sharply from consumer chat. Verified current terms:

- **Anthropic API (commercial):** not used to train models; inputs/outputs auto-deleted
  within ~30 days; Zero-Data-Retention available for eligible enterprise.
- **OpenAI API:** not used to train by default; ~30-day abuse-monitoring retention, then
  deleted; ZDR for eligible customers.
- **Google Gemini — landmine:** **paid tier / Vertex AI = not used for training. The FREE AI
  Studio tier CAN be used to improve Google's products.**

**Safe public claim:** "processed under commercial/paid API terms that prohibit model
training; retained only briefly for abuse-monitoring, then deleted." **Do NOT** say "never
stored" or "deleted instantly" — that overstates it.

**Internal must-verify (P1-grade):** confirm avint's Gemini OCR runs on the **paid tier or
Vertex**, not a free AI Studio key. If it's on free, either upgrade or soften the copy — the
"not used for training" claim is otherwise false for that leg.

Architecture we can truthfully cite: Supabase AES-256 at rest + TLS in transit, **RLS
(`auth.uid() = user_id`) as the real boundary**, ephemeral signed-URL processing, PII
minimization (tax metadata only — no SSN/TIN/full bank #), software-tool disclaimer, user/
preparer verification duty (Circular 230), explicit upload opt-in, 1-click hard delete, DPA
for firms.

---

## 6. Bespoke build studio (the client-work engine)

The web/systems-dev angle is real and underrepresented (kept quiet to avoid confusing "what
we do"). Now being surfaced: a dedicated **`/studio` services page** + a **Chroma Fairy page
pivot** using the live CF build as proof-of-work.

- What we sell: bespoke web apps/storefronts; **Smart-Storage-style ingestion → processing →
  output custom tools for any workflow (not just finance/tax)**; internal tools & ops
  dashboards; interactive/WebGL motion design; **AI workflow automation** (see below).
- **AI workflow automation (capability + proof):** multi-step pipelines that validate, score,
  route, and act on incoming data across a client's existing tools (Sheets, email, DB, AI),
  then write results back and notify the right people. **Proof point — PicklePal partner-
  onboarding review** (built in Gumloop): reads applications from a Google Sheet, an AI (Claude)
  validates ID / authority / entity / role documents and scores them, then decisions are written
  back to the sheet and applicants are emailed automatically. This is a reusable pattern to
  fold into our own system builds *and* to sell as client work — bake "review/validate → decide
  → record → notify" automations into products where a human bottleneck exists today.
- Differentiator: agency-grade software at solo speed via an AI-orchestrated loop; production
  discipline (RLS, atomic transactions, security review, observability).
- **No client-facing pricing** (client-dependent). Internally: tier build archetypes + rate
  guidance (task #23).
- **No more discounts.** First paying client (family) was on a discount — the last one.
- Free-time capability: build a **reusable UI + animation catalogue** tagged by industry/
  design language to accelerate client builds (task #24).

---

## 7. Corporate & tax structure — roadmap, not action

**Direction (agreed):** phased **PH (ops/R&D) → US LLC (customer-facing/merchant) → Singapore
holding (global parent, IP/M&A)**. Build each phase only when MRR justifies the overhead.
**Tokyo entity = scratched** (lifestyle/market only). Today: **US account only (no US entity);
PH business registered.**

**Corrections we must respect (do not act on AI tax advice):**
- A PH **DTI sole proprietorship is not a separate legal person** — "the company owns the
  car/house" is really *you* owning it. True separation needs an OPC/corporation.
- **PH Fringe Benefit Tax** applies to owner-used company vehicles/residence — a real cost.
- Director's-loan "buy a house tax-free" and corporate-owned residence carry FBT / imputed-
  interest / BIR exposure — not clean hacks.
- BIR 8% flat rate, foreign-sourced-income treatment, and PH↔US transfer pricing need a
  licensed cross-border CPA + lawyer. **The shape is reasonable; the specific mechanics must be
  professionally structured before any move.**

---

## 8. M&A optionality (Smart Storage carve-out)

Smart Storage (tool + dashboards + tax engine) can be sold standalone via an **Asset Purchase
Agreement** — codebase repo (single-repo GitHub transfer), product domain, subscriber DB —
while we **keep the AVIntelligence name, other apps, and the estate vision.** No separate
company needed to sell.

- **Two-domain separation:** a company/portfolio site (never for sale) vs. the product domain
  that goes with the tool. Andrew is fine losing `avintph.com` and wants the portfolio migrated
  to a global company domain.
  - **`avintelligence.com` is NOT ours** — it's registered by a third party. Treat it as a
    **late-game aftermarket acquisition** for when we're funded (aftermarket bid likely well
    above the ~$11 registrar price; we can't justify it now).
  - **Interim company domain: TBD** — pick an affordable variant now (e.g. `.io` / `.ai` /
    `.studio` / `.co`) as the portfolio/company home, and upgrade to `avintelligence.com` later
    if/when the acquisition is affordable. Open decision.
- Housekeeping for later: ToS assignment-on-acquisition + privacy consent for data transfer;
  cleaner if US/SG restructure precedes a real M&A conversation.
- **Comp reality:** the ~$12B deal was Intuit→Mailchimp (a marketing platform, not a tool).
  The relevant tool comp is **Xero→Hubdoc (~$70M).** Smart Storage could plausibly exceed that
  — but only conditional on real customers + MRR/ARR.

---

## 9. Valuation & milestones

**Plan of record: get to $1M ARR first, then compound.** Honest exit math:
- PE/aggregator ≈ 3–5x; mid-strategic ≈ 5–10x; big-tech strategic higher but only at scale.
- ~$50M needs roughly ~$5M ARR + a strategic buyer or a bidding war. The earlier 10–20x-ARR
  figures for a tiny bootstrapped SaaS are not realistic at our stage.

**North-star stretch (Andrew):** a **$1–3B exit on spectacular execution** — held explicitly as
aspiration (venture/serial-exit scale), not the plan of record.

**Benchmark tiers (company names stripped, per Andrew — used only to gauge success):**
- Tier 1 (surpass a regional conglomerate, ~$50–87M): Smart Storage ~$3–5M ARR → exit
  ~$15–50M, or ~$5M combined studio ARR. 3–5 yrs.
- Tier 2 (match a national conglomerate, ~$1B): serial exits + estate appreciation, or
  VC-backed scale. 7–15 yrs. Stretch. (Leans on the same optimistic multiples — motivational.)

---

## 10. North-star vision — Bukidnon destination estate (firewalled)

Long-term, convert software USD into a mixed-use **global destination hub** in **Libona /
Manolo Fortich, Bukidnon** (near CDO): membership club, main convention theatre, a separate
glass-enclosed **waterfall-view** event venue + exterior deck, wedding venue, premium
basketball court, driving range, Tokyo-style curated arcade, independent creator studios, and a
curated commercial leasing ring.

- **Global events** (esports/tech/auto); explicitly **not Metro Manila**; **synergy not
  competition** with local resorts/hotels (compete for events, not accommodations); **no owned
  hotel** — ground-lease land to operators (zero hospitality CapEx).
- Aviation reality: CDO/Laguindingan is a domestic hub; international routes connect via
  MNL/CEB/DVO + a short domestic leg (Niseko model).
- **Firewalled:** a "happy problem" for after Smart Storage has traction. No build cycles now.

---

## 11. Operating model & focus order

**Current work order:**
1. **CF product page → dev-angle reframe + `/studio` services page** (task #22; blocks #21).
2. **CPA / firm partnership strengthening + execution** (§3).
3. **P1 — Reports & Exports accuracy** (ongoing lane; task #15), incl. the Gemini paid-tier
   verification from §5.

Estate/diversification/global structure = north-star only; strategize, don't build.

**Housekeeping loose ends:** avint `lib/accounting-csv.ts` Xero fix (uncommitted); stray
`test_*.csv` in the avint repo.
