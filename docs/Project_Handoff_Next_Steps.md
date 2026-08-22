# AVIntelligence — Project Handoff & Next Steps (avintph)

> Launch pad for the new Claude Project. Attach `docs/AVIntelligence_Strategy.md` as project
> knowledge; every thread below should read it (and CLAUDE.md) first. Roles unchanged: Andrew =
> founder/direction; Claude = CTO/strategy/review; Codex = implementation; Perplexity/Gemini =
> research; ChatGPT/Gemini = images.

## Where we are
Strategy is captured and de-hyped (`AVIntelligence_Strategy.md`). The dev-angle is now live:
`/studio` services page + Chroma Fairy pivot shipped (commit `ec1d7dc`). Two pitch decks
scoped: studio bespoke-builds deck (#25, outlined) and Smart Storage CPA-firm deck (#21).

For future studio web work, read `docs/AVIntelligence_Studio_Architecture_Tech_Stack.md` with
`docs/AVIntelligence_Studio_Brief.md`. It is the web/creative architecture handoff: reusable
motion orchestration, Three.js/WebGL scene systems, shader and media delivery, performance,
visual QA, and the boundary between experience architecture and data architecture. The
universal workflow and Smart Storage handoffs remain authoritative for data flow, persistence,
security, extraction, reporting, and source-to-work continuity.

## Near-term roadmap (prioritized)

**P0 — finish in flight**
- Apply the **AI workflow-automation card** to `/studio` (Codex prompt already written).
- **Defensibility FAQ** using the verified API terms (§5 of strategy) — high value, quick.
- **Commit + deploy** the uncommitted Xero `lib/accounting-csv.ts` fix; remove stray
  `test_*.csv` from the avint repo.

**P1 — the priority lane (correctness)**
- **Reports & Exports Accuracy (#15):** build the reusable skill; independently recompute the
  remaining reports (Business Expense, P&L, income/expense summaries); confirm Xero real-import.
- **Verify Gemini runs on the paid tier / Vertex (§5)** — gates any "not used for training"
  copy. Treat as P1-grade.
- **Refund/credit handling (#17)** — pending preparer sign-off (#19).

**Next focus — the channel**
- **Smart Storage B2B/firm positioning (#21):** sharpen the labor-elimination narrative +
  corrected numbers → build the CPA-firm deck → execution infra: `/for-accountants` portal +
  `/cpa/[slug]` intake + Creem referral metadata (Path A), wholesale SKUs later (Path B).

**Decks**
- **#25** studio bespoke-builds deck → build `.pptx` from `Studio_Pitch_Deck_Outline.md`.
- **#21** Smart Storage firm deck.

**Internal / enabling**
- **#23** tier build offerings + rate guidance (no public pricing; no more discounts).
- **#24** reusable UI + animation catalogue.
- **Interim company domain** decision (§8): pick an affordable `.io`/`.ai`/`.studio`/`.co`
  now; `avintelligence.com` is a funded-later aftermarket acquisition.

**Lower / parked**
- **#16** Claude analytics + dashboard widget-authoring (post-P1).
- **#13** unlimited `gift_code` → Pro (lowest).
- Estate / PH→US→SG structure = north-star only; strategize, don't build.
- Chroma Fairy (#10 notifications test, #11 polish, #20 Sam studio session) — on Sam's plate.

---

## Ready-to-paste thread kickoff prompts

**Thread A — Studio finish + bespoke-builds deck**
> Read docs/AVIntelligence_Strategy.md and docs/Studio_Pitch_Deck_Outline.md. First, confirm the
> AI workflow-automation card is on /studio (apply the pending Codex prompt if not). Then help me
> pick an interim company domain, and build the studio bespoke-builds deck (#25) as a .pptx from
> the outline — research/assets first, then the pptx skill.

**Thread B — Smart Storage CPA channel**
> Read docs/AVIntelligence_Strategy.md §3–4. Help me strengthen the Smart Storage B2B/firm
> positioning (labor-elimination lead, corrected numbers), then build the CPA-firm pitch deck
> (#21), then scope the execution infra: /for-accountants portal, /cpa/[slug] intake, and Creem
> referral metadata (Path A). Package build work as Codex prompts.

**Thread C — P1 Reports & Exports accuracy**
> Read docs/AVIntelligence_Strategy.md §5 and CLAUDE.md. Continue P1 (#15): build the
> Reports & Exports Accuracy skill, independently recompute the remaining reports, and verify
> our Gemini OCR runs on the paid tier / Vertex (gates our privacy copy). Flag anything where a
> report/export could overstate accuracy.

**Thread D — Site trust & copy + cleanup**
> Read docs/AVIntelligence_Strategy.md §5. Draft the Smart Storage defensibility FAQ using the
> verified commercial-API terms (no overstated "never stored" claims) as a Codex prompt. Then
> commit/deploy the uncommitted Xero lib/accounting-csv.ts fix and remove the stray test_*.csv.

**Thread E — Internal ops (tiers, catalogue, domain)**
> Read docs/AVIntelligence_Strategy.md §6. Help me define internal build tiers + rate guidance
> (#23, kept off the public site), start the reusable UI/animation catalogue (#24), and finalize
> the interim company-domain choice (§8).

---

## Loose ends checklist
- [ ] Apply workflow-automation card to /studio (Codex prompt ready)
- [ ] Defensibility FAQ (verified terms)
- [ ] Commit + deploy Xero `lib/accounting-csv.ts` fix
- [ ] Remove stray `test_*.csv` from avint repo
- [ ] Verify Gemini paid tier / Vertex
- [ ] Pick interim company domain
