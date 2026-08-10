# AVIntelligence — Days 1–3 Build Brief (repositioning + fixes)

Repo: `~/Documents/AVINTELLIGENCE/avint`. Codex executes here.

**Governance:** material changes (billing/entitlement, security, tax logic) need Andrew's sign-off. Items marked **[DECIDE]** must NOT be built until approved. Do **not** touch the tax-bundle report math — it's validated end-to-end.

## Pre-confirmed
- Tax bundle validated (OCR, classification, income partitioning, meals 50%, review path, folder targeting all correct).
- Default-year fix already handled in Codex (separate).
- Folder targeting works (no change needed).

---

## Day 1 — Repositioning (copy / front-end, safe to build)
1. **Homepage rewrite around the outcome, not storage:**
   - Headline: *"Stop sorting receipts manually. Upload your documents and get a clean expense report in minutes."*
   - Subhead: extracts vendors, dates, amounts, categories, and recurring expenses from receipts and invoices → searchable records + exportable reports.
   - 3-step "how it works": **Upload → AI extracts & categorizes → Export an accountant-ready report.**
   - Reframe features as outcomes; storage becomes plumbing, not the pitch.
   - Make the **recurring plan the hero**; demote day-pass/gift codes to a secondary option. *(Emphasis/layout only — no price changes.)*
   - Add **3 sample reports** and visible **privacy / security / data-deletion** copy.
   - Primary CTA text depends on the free experience (Day 2, item 5). Until that's approved, use "Start free"; switch to "Process 10 documents free" once approved.
2. **Report footer branding:** every exported report/PDF gets a subtle, professional footer — *"Prepared with AVIntelligence — organize your business documents automatically."* (self-distribution loop).

## Day 2 — Funnel + accountant export
3. **QuickBooks/Xero-formatted CSV export:** add export presets mapping the expense/tax-bundle data into QuickBooks- and Xero-friendly CSV formats (categorized transactions, vendor + date normalized). Purely additive — unlocks the accountant channel without a full integration.
4. **Activation analytics:** instrument `document_uploaded`, `extraction_completed`, `report_exported`, `upgrade_clicked`, `subscribed`. Define **activation = uploaded ≥5 docs AND exported ≥1 report** (not signup).
5. **[DECIDE — billing/entitlement] Free document-processing front door:** a low-friction free experience (e.g. 10 docs/month, basic extraction, 1 export) with an upgrade prompt **after** the first report export. This redefines the free tier → needs Andrew's approval on exact limits before building.

## Day 3 — SEO + security fix + marketplace kickoff
6. **Audience SEO landing pages (3–5):** same product, audience language, example output, free-upload CTA:
   `/receipt-organizer-for-freelancers`, `/expense-reports-for-agencies`, `/invoice-organizer-for-contractors`, `/business-receipt-tracker`, `/receipt-to-csv-converter`.
7. **[SECURITY — approved] Prescan `/OpenAction` calibration** — `supabase/functions/prescan-document/index.ts`, `analyzePdf()` + `SUSPICIOUS_PDF_MARKERS`:
   - Keep hard-blocking: `/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`, `/RichMedia`, `/SubmitForm`, `/ImportData`.
   - For `/OpenAction` and `/AA`: only reject if the referenced action **also** contains `/JavaScript`, `/JS`, or `/Launch`. A benign view action (e.g. `/OpenAction [N 0 R /FitH null]`) must pass.
   - Deploy `supabase functions deploy prescan-document --no-verify-jwt`; ensure `config.toml` has `verify_jwt = false`.
   - Add tests: benign-OpenAction PDF passes; JS-in-OpenAction PDF is blocked.
8. **Directory submissions (manual, not code):** AlternativeTo, G2, Capterra, SaaS directories.
9. **Marketplace kickoff (manual, external clocks start now):** Google Cloud project + OAuth consent screen for a Workspace add-on; Chrome Web Store dev account; QuickBooks/Xero dev accounts. *(Live listings take ~2–6 weeks — start the clocks.)*

---

## Deferred / decide separately
- **[DECIDE] Fair-use processing cap** on the $12 plan (protects margins; billing logic — approve before building).
- **[DECIDE] Full $9/$19/$49 re-tier** — revisit with usage data.
- Marketplace *integrations going live* — weeks, external review.

Each change: build passes, commit, push.
