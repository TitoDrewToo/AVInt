# Codex Brief — Smart Storage marketing pages + Claude connector

Goal: feature the Claude connector across the Smart Storage surfaces and make the
connect page lead with the real (OAuth) flow. All copy below is **audited against the
repo** — do not add capabilities beyond this list.

## Capability source-of-truth (do not exceed)

- Ingest doc types: receipt, invoice, payslip, income_statement, bank_statement,
  transaction_record, contract, agreement, tax_document, general_document.
- Upload formats: PDF, JPG/JPEG, PNG, WEBP, HEIC, CSV, XLSX; ≤ 60 MB
  (`lib/smart-storage.ts`).
- Web reports (7): Expense Summary, Income Summary, Tax Bundle (Schedule C),
  Profit & Loss, Contract Summary, Key Terms, Business Expense (`REPORTS` in
  `lib/smart-storage.ts`).
- Exports: QuickBooks 3-col, QuickBooks 4-col, Xero (`lib/accounting-csv.ts`).
- Dashboard: Smart Dashboard, Custom Dashboards, Advanced Analytics; recurring-expense
  detection (Pro+). Plan gates in `supabase/functions/_shared/plan-limits.ts`.
- **Connector (MCP) exposes exactly three tools** (`app/api/mcp/[[...transport]]/route.ts`):
  - `smart_storage.ingest` — add up to 6 documents
  - `smart_storage.report` — **tax_bundle OR business_expense only** (not the other 5 reports)
  - `smart_storage.export` — QuickBooks (3/4-col) or Xero
  - Gate: **Pro or Business only**. Auth: WorkOS OAuth (no passwords reach the server);
    per-account isolation by matched email.

## 1. Smart Storage card (home / product grid)

Current copy: "Upload your receipts and invoices. AI reads and organizes them. Reports
ready. Turn your files into tax-ready summaries — export-ready for QuickBooks & Xero."

Change: add a small **"Works in Claude"** badge/eyebrow on the card, and append one line:

> Now works inside Claude — run your tax bundle and pull a QuickBooks export right from chat.

Keep it to one added line + badge; don't bloat the card.

## 2. Connect page — `app/tools/smart-storage/connect/connect-client.tsx`

Problem: when `oauthEnabled`, the page still centers API keys. API keys do **not** work
for Claude/Cowork (which requires OAuth). Restructure so OAuth is the primary path.

Primary section (when `oauthEnabled`) — "Connect to Claude" with numbered steps:
1. In Claude: **Settings → Connectors → Add custom connector**.
2. Paste `https://www.avintph.com/api/mcp` and click **Add** — leave the optional OAuth
   Client ID/Secret **blank** (Claude registers itself).
3. Click **Connect** and **sign in with the Google account (or email) that matches your
   AVIntelligence account**. Approve access — done.

Add a short "What you can do from Claude" list (accurate):
- Ingest documents into Smart Storage
- Run your **Tax Bundle** and **Business Expense** reports
- Export to **QuickBooks or Xero**
- Pro/Business only; each call acts on your own account.

Add the account-matching note (mismatch message: "Connect requires a Smart Storage
account with this email").

Demote the existing API-key UI to a collapsed/secondary block titled
**"Advanced: programmatic API keys"** — keep all current generate/rotate/revoke/delete
functionality intact, just visually secondary and clearly labelled as for non-Claude
programmatic clients.

## 3. Product page — `app/products/smart-storage/page.tsx`

Add a new section (suggest placing right after the "Works with QuickBooks & Xero" block),
eyebrow **"Now works inside Claude"**:

Headline: **Your Smart Storage, now operable from Claude.**
Body (lead with the workflow-automation angle — files live in Smart Storage; Claude acts on them):
> Your documents already live in Smart Storage. Connect it to Claude and run the whole
> workflow in plain language — pull your Schedule C tax bundle and get back an
> import-ready QuickBooks **or** Xero file, without opening the dashboard. It works
> securely on your own account and it's included with Pro.

Three mini-cards (accurate to the 3 tools — lead with report/export automation, ingest is the bonus):
- **Report** — "Ask for your Tax Bundle or Business Expense report and get the numbers back in chat — straight from the documents already in Smart Storage."
- **Export** — "Generate an import-ready QuickBooks or Xero file — same workflow, either platform — without leaving the conversation."
- **File (bonus)** — "Have a new receipt? Drop it into the chat and Claude files it into Smart Storage, classified and extracted."

CTA button: **Connect to Claude** → `/tools/smart-storage/connect`.
Sub-note: "Pro & Business plans. Secure OAuth sign-in — AVIntelligence never sees your password."

Accuracy note for this section: the export produces an **import-ready file** for QuickBooks or
Xero — it does NOT post directly into those accounts. Do not use "sync"/"syncs to QuickBooks"
(live sync is a separate roadmap item already marked "coming soon" on pricing). QuickBooks and
Xero must be presented symmetrically (the connector supports both equally).

Also update page `metadata.description` to mention the Claude connector, e.g. append:
"Now available as a Claude connector."

## Accuracy guardrails (do not violate)

- Do NOT claim all 7 reports are available in Claude — only Tax Bundle + Business Expense
  (plus ingest + QuickBooks/Xero export).
- Do NOT imply the connector is on Free/Day Pass — it is Pro/Business.
- Reword the "SOC 2 Type II Certified" line on the product page to **"Built on SOC 2 Type II-certified
  infrastructure"** (it refers to the underlying database provider, not an AVIntelligence audit —
  approved by owner). Do not strengthen it beyond this.
- Keep the existing site voice (short, benefit-led, e.g. "Upload. Generate.").

## Out of scope (later milestone)

Connectors Directory submission (needs Production WorkOS env vars + reviewer materials).
The Production resource indicator is already set. Not part of this task.
