# Product Positioning — What AVIntelligence Is and Is Not

Every customer-facing message from any agent or Cowork task must stay inside these lines. The product is technically capable of more than this; the **positioning** is what's defensible today. Scope creep in messaging creates support burden, refund risk, and eventually liability.

## Geographic split (read first)

The product has two genuinely different go-to-market lines, and the positioning per audience must respect which line they're in:

| Line | Audience | Primary site | What's on offer |
|---|---|---|---|
| **PH-first SaaS** | Philippines accountants and their clients (small businesses, freelancers, sole proprietors) | avintph.com | Smart Storage, Smart Dashboard, multi-document reports, multi-currency document organization — **NOT** BIR e-filing or BIR form generation |
| **US Schedule C / DFY** | US Schedule C filers and US bookkeepers | (US-facing surface — current primary site avintph.com may not be the right surface for US outbound; founder confirm) | Tax Bundle, Extension Rescue service, US-specific DFY offerings |

**Do not blur these.** A draft to a PH accountant should not mention Schedule C, Form 1099, or TurboTax. A draft to a US bookkeeper should not mention BIR, eFPS, or 1701/2316 forms. The Schedule C content is US-only; everything else (Smart Storage, Smart Dashboard, multi-document reports) is currency-agnostic and PH-applicable.

## What AVIntelligence IS

- A **document intelligence platform** for financial and operational records
- A **receipt, invoice, payslip, and contract organizer** with AI-driven categorization
- A **multi-document report producer** (Tax Bundle, Business Expense, P&L, Income Summary, Expense Summary, Contract Summary, Key Terms)
- A **Smart Dashboard** for historical analytics on your own documents (currency-agnostic, works for any region)
- An **audit-trail generator** with per-row source linkage
- A **white-label-capable input layer** for accountants and bookkeepers — clients upload to a partner-branded surface, accountant works from organized output
- For US-only: a **Schedule C expense organizer** with IRS-aligned categorization (2025 rev), and a **done-for-you Extension Rescue service**

## What AVIntelligence IS NOT

These are the lines that, if crossed in any message, trigger automatic draft rejection.

**Universal (applies to all audiences):**
- ❌ NOT a bookkeeping platform (no GL, no journal entries, no reconciliation, no payroll)
- ❌ NOT a QuickBooks / Xero / MYOB replacement
- ❌ NOT a CPA replacement
- ❌ NOT a tax advisor (no advice, no opinions on filings)
- ❌ NOT a payments processor (Creem handles billing — we are not a billing platform)
- ❌ NOT audit defense
- ❌ NOT guaranteed accuracy (we have confidence flags, not guarantees)
- ❌ NOT "instant" — extraction has latency; DFY services have 5-business-day delivery

**US-specific NOTs (when audience is US):**
- ❌ NOT a tax filing tool
- ❌ NOT a TurboTax / H&R Block / TaxAct alternative
- ❌ NOT certified for tax preparation
- ❌ NOT licensed by IRS as a return preparer (no CAF, no EFIN)
- ❌ NOT computing self-employment tax (Schedule SE)
- ❌ NOT calculating QBI deduction (Section 199A)
- ❌ NOT handling state tax (any state)
- ❌ NOT handling COGS / inventory (Schedule C Part III)
- ❌ NOT handling Schedule B / D / E
- ❌ NOT a Form 8829 (home office) calculator — categorizes only

**PH-specific NOTs (when audience is PH):**
- ❌ NOT BIR e-filing / eFPS submission
- ❌ NOT BIR form generation (1601-C/E, 2550M/Q, 1701, 1702, 0619, 2316, etc.)
- ❌ NOT VAT computation
- ❌ NOT withholding tax computation
- ❌ NOT a CAS (Computerized Accounting System) replacement — we are explicitly upstream of CAS
- ❌ NOT certified by BIR, SEC, or BSP
- ❌ NOT a substitute for a PH-licensed CPA

## Approved One-Liners

Pick the right one for the audience, never invent new claims:

| Audience | One-liner |
|---|---|
| PH accountant (channel partner) | "Your clients drop their receipts and documents into AVIntelligence. They come back to you already organized. You do the actual accounting; we handle the upstream chaos." |
| PH SMB / freelancer (end user via partner) | "Receipts, invoices, payslips — drop them in, get them organized into reports your accountant can work from." |
| US bookkeeper | "We turn your client's receipt pile into a Schedule C-ready summary. You file. Your client thinks you're magic." |
| US extension filer | "Receipt pile → Schedule C summary your CPA can file from. Five business days, $199." |
| Generic SMB | "Document intelligence for the financial paperwork you've been avoiding." |
| Investor / partner | "We're the input layer to bookkeeping and tax prep — the part the existing tools assume you've already done." |

## Approved Capability Claims

These are defensible against the actual code:

**Universal:**
- ✅ "OCR for PDF, JPG, handwritten receipts, screenshots, and CSV/XLSX uploads"
- ✅ "Per-row audit trail to source document"
- ✅ "Confidence-based review flagging"
- ✅ "Multi-currency document organization with mixed-currency detection"
- ✅ "Multi-document reports: Tax Bundle, Business Expense, P&L, Income Summary, Expense Summary, Contract Summary, Key Terms"
- ✅ "Smart Dashboard with historical analytics on the user's documents"
- ✅ "AI-driven categorization with reclassify-and-correct workflow"
- ✅ "Reconciliation identity preserved (totals always match line buckets)"

**US-only:**
- ✅ "20 IRS Schedule C lines mapped, 2025 revision"
- ✅ "TCJA-aware (entertainment correctly excluded)"
- ✅ "Meals 50% deductibility auto-applied"
- ✅ "W-2 wages correctly segregated from Schedule C math"

## Disapproved Capability Claims

Auto-reject any draft containing these or near-paraphrases:

**Universal:**
- ❌ "AI-powered tax filing"
- ❌ "Replace your accountant"
- ❌ "Audit-proof" (no software is audit-proof)
- ❌ "Guaranteed accuracy"
- ❌ "Tax-prep software"
- ❌ "Smart tax assistant" (sounds like advisor)
- ❌ "Find every deduction" (we surface what's in the documents — we don't know about deductions you haven't documented)
- ❌ "AI-powered" used as a primary descriptor (we are an organizer, not an AI demo — see voice-and-tone.md)
- ❌ Any claim that we file, submit, or transmit on behalf of the user

**US-only:**
- ❌ "File your taxes"
- ❌ "Calculate your taxes"
- ❌ "Maximize your refund"
- ❌ "IRS-approved" / "IRS-certified"
- ❌ "Tax-savings algorithm"

**PH-only:**
- ❌ "BIR-certified"
- ❌ "BIR-compliant filing" (we don't file)
- ❌ "Generate your 1701" (or any BIR form)
- ❌ "VAT-ready filing"
- ❌ "Replace your CPA"

## Required Disclaimers

Whenever a draft mentions tax-aligned outputs, append (or include in cover letter):

**For US Schedule C outputs:**
> "This is an organized expense summary aligned to IRS Schedule C categories. It is not a tax return, not tax advice, and not a substitute for a licensed tax preparer. Consult a CPA or enrolled agent before filing."

**For PH outputs (when accountant-channel materials reference filing):**
> "AVIntelligence organizes source documents into reports. It does not file with the BIR and is not a substitute for a licensed accountant. Your accountant remains responsible for compliance, computation, and filing."

## Pricing Reference

| Tier | Price | What it includes |
|---|---|---|
| Free | $0 | Self-serve, basic storage, basic reports |
| Day Pass | (see Creem) | 24-hour Pro access, single-use buyers |
| Pro Monthly | (see Creem) | Full storage, all reports, all features |
| Pro Annual | (see Creem) | Largest storage tier, all reports, all features |
| Extension Rescue (US DFY) | $199 | Service: receipts → Schedule C summary, 5 business days |
| Q2 Estimated Tax Prep (US DFY) | $149 | Service: Q2 1099 prep |
| Mid-Year P&L Cleanup (US DFY) | $249 | Service: H1 cleanup + P&L |
| Full-Year Schedule C Prep (US DFY) | $399 | Service: Jan–Apr peak |
| PH accountant partner tier | TBD (see `icp-ph-accountants.md`) | TODO founder lock |

DFY pricing is launch-tier. Adjust upward after 5 deliveries based on time-per-delivery data. Payment provider is **Creem** (see Creem dashboard for current published amounts on the SaaS tiers).

## Geographic Scope (rule of thumb)

- **Schedule C / DFY services**: US only (federal). State tax explicitly out of scope.
- **Smart Storage / Smart Dashboard / non-tax reports**: currency-agnostic, any region.
- **Tax Bundle**: US P1; not for PH use.
- **PH partner motion**: organizes input documents for PH accountants and their clients; does not touch BIR filing.

This split exists because Tax Bundle is US-specific; the rest of the product is currency-agnostic by design.
