# Product Positioning — What AVIntelligence Is and Is Not

Every customer-facing message from any agent must stay inside these lines.
The product is technically capable of more than this; the **positioning** is
what's defensible today. Scope creep in messaging creates support burden,
refund risk, and eventually liability.

## What AVIntelligence IS

- A **document intelligence platform** for financial and operational records
- A **Schedule C expense organizer** with IRS-aligned categorization (2025 rev)
- A **receipt-to-summary workflow** for self-employed US filers
- An **audit-trail generator** with per-row source linkage
- A **multi-document report producer** (Tax Bundle, Business Expense, P&L,
  Income Summary, Expense Summary, Contract Summary, Key Terms)
- A **Smart Dashboard** for historical analytics on your own documents
- A **white-label-capable input layer** for bookkeepers and CPAs

## What AVIntelligence IS NOT

These are the lines that, if crossed in any message, trigger automatic
draft rejection.

- ❌ NOT a tax filing tool
- ❌ NOT a TurboTax / H&R Block / TaxAct alternative
- ❌ NOT a CPA replacement
- ❌ NOT a bookkeeping platform (no GL, no reconciliation, no payroll)
- ❌ NOT a QuickBooks / Xero replacement
- ❌ NOT certified for tax preparation
- ❌ NOT licensed by IRS as a return preparer (no CAF, no EFIN)
- ❌ NOT a tax advisor (no advice, no opinions on filings)
- ❌ NOT computing self-employment tax (Schedule SE)
- ❌ NOT calculating QBI deduction (Section 199A)
- ❌ NOT handling state tax (any state)
- ❌ NOT handling COGS / inventory (Schedule C Part III)
- ❌ NOT handling Schedule B / D / E
- ❌ NOT a Form 8829 (home office) calculator — categorizes only

## Approved One-Liners

Pick the right one for the audience, never invent new claims:

| Audience | One-liner |
|---|---|
| Bookkeeper | "We turn your client's receipt pile into a Schedule C-ready summary. You file. Your client thinks you're magic." |
| Extension filer | "Receipt pile → Schedule C summary your CPA can file from. Five business days, $199." |
| Generic SMB | "Document intelligence for the financial paperwork you've been avoiding." |
| Investor / partner | "We're the input layer to tax prep — the part TurboTax assumes you've already done." |

## Approved Capability Claims

These are defensible against the actual code (verified in lib/tax-bundle.ts):

- ✅ "20 IRS Schedule C lines mapped, 2025 revision"
- ✅ "TCJA-aware (entertainment correctly excluded)"
- ✅ "Meals 50% deductibility auto-applied"
- ✅ "W-2 wages correctly segregated from Schedule C math"
- ✅ "Mixed-currency detection with explicit warnings"
- ✅ "Per-row audit trail to source document"
- ✅ "Confidence-based review flagging"
- ✅ "Reconciliation identity preserved (totals always match line buckets)"
- ✅ "OCR for PDF, JPG, handwritten receipts"

## Disapproved Capability Claims

Auto-reject any draft containing these or near-paraphrases:

- ❌ "File your taxes"
- ❌ "Calculate your taxes"
- ❌ "Replace your accountant"
- ❌ "AI-powered tax filing"
- ❌ "Maximize your refund"
- ❌ "Find every deduction" (we surface what's in the documents — we don't
   know about deductions you haven't documented)
- ❌ "IRS-approved" / "IRS-certified"
- ❌ "Audit-proof" (no software is audit-proof)
- ❌ "Guaranteed accuracy" (we have confidence flags, not guarantees)
- ❌ "Tax-prep software"
- ❌ "Tax-savings algorithm"
- ❌ "Smart tax assistant" (sounds like advisor)

## Required Disclaimers

Whenever a draft mentions tax outputs, append (or include in cover letter):

> "This is an organized expense summary aligned to IRS Schedule C categories.
> It is not a tax return, not tax advice, and not a substitute for a licensed
> tax preparer. Consult a CPA or enrolled agent before filing."

## Pricing Reference

| Tier | Price | What it includes |
|---|---|---|
| Free | $0 | Self-serve, 5 GB storage, basic reports |
| Day Pass | (see Creem) | 24-hour Pro access, single-use buyers |
| Pro Monthly | (see Creem) | 1 TB, all reports, all features |
| Pro Annual | (see Creem) | 2 TB, all reports, all features |
| Extension Rescue (DFY) | $199 | Service: receipts → Schedule C summary, 5 business days |
| Q2 Estimated Tax Prep (DFY) | $149 | Service: Q2 1099 prep |
| Mid-Year P&L Cleanup (DFY) | $249 | Service: H1 cleanup + P&L |
| Full-Year Schedule C Prep (DFY) | $399 | Service: Jan–Apr peak |

DFY pricing is launch-tier. Adjust upward after 5 deliveries based on time-per-
delivery data.

## Geographic Scope

- **Schedule C / DFY services**: US only (federal). State tax explicitly out of scope.
- **Smart Storage / Smart Dashboard / non-tax reports**: currency-agnostic, any region.

This split exists because Tax Bundle is US-specific; the rest of the product
is currency-agnostic by design. Per project memory:
> Tax Bundle is US P1; all other reports/dashboards must stay
> currency-agnostic.
