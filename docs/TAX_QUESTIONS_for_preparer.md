# Tax-treatment questions for a US preparer (CPA/EA)

Context to give her: "We're building software that organizes a US small business's / sole
proprietor's receipts and invoices into a **Schedule C–style** summary of income and deductible
expenses, and exports to QuickBooks/Xero. We want the **correct default treatment** for each item
below, and to know which items we should **flag for the taxpayer's own preparer** rather than
decide automatically. General US federal treatment for a cash-basis sole proprietor unless noted —
no need to review any specific return."

Grouped, highest-impact first. Each needs: (a) the correct rule, (b) whether we should auto-apply
it or flag it for review.

## 1. Refunds / rebates / credits on a business expense  ⭐ (already researched — please confirm)
- If a refund of a deductible expense is received in the **same tax year**, is it correct to
  **reduce/net it against that expense** (not report income)?
- If received in a **later year** after the expense was deducted, is it **income under the tax
  benefit rule (IRC §111)**, limited to the tax benefit obtained?
- How should we handle a refund we can't tie to a specific prior expense — flag as possible income?

## 2. Meals & entertainment
- Is the business-meals deduction currently **50%** (confirm the 100% restaurant provision expired
  after 2022)? Any meals that are **100%** (e.g., office snacks, company-wide events, meals sold to
  customers)?
- **Entertainment** — confirm it's fully **non-deductible** post-TCJA, so we should exclude/flag it.

## 3. Vehicle & travel  ⭐
- Car/truck: **standard mileage vs actual expense** method — since we only see receipt amounts
  (fuel, parking, tolls), should vehicle *receipts* even be deducted directly, or flagged because
  they depend on the method + business-use %?
- Travel (airfare, lodging): fully deductible if business? Any allocation rules for mixed trips?

## 4. Equipment / capital purchases  ⭐
- Hardware/computers/equipment: when to **expense immediately** (de minimis safe harbor — confirm
  the **$2,500 per-item** threshold) vs **§179** vs **depreciate**? What's a safe default, and above
  what amount should we flag for depreciation treatment?

## 5. Home office
- Correct handling — **simplified method** ($5/sq ft) vs **Form 8829 actual**? Should home-office
  receipts be flagged rather than summed (they depend on exclusive-use % and a separate form)?

## 6. Mixed personal/business use  ⭐
- Phone, internet, and similar: these are often **partly personal**. Should we apply the full
  amount, or always **flag for a business-use %**? What's standard?

## 7. Foreign-currency expenses  ⭐
- Business expenses paid in a non-USD currency: must they be **converted to USD** for a US return
  (and at what rate — transaction-date spot?)? We currently **exclude** non-USD items from the tax
  summary — is exclusion acceptable, or must they be converted and included?

## 8. Income classification
- Confirm **W-2 wages cannot be offset by Schedule C business expenses** (we keep them separate).
- Confirm **investment / interest / rental income** does **not** belong on Schedule C (goes on
  Sch B / D / E) — we surface it separately, not netted against business expenses.
- For self-employment, is **gross receipts** the correct Schedule C starting figure (before
  expenses)?

## 9. "Estimated net profit" figure
- We show `self-employment gross − deductible expenses` as an **estimated net**. What caveats must
  accompany it so it isn't misleading (it ignores COGS, depreciation schedules, **self-employment
  tax ~15.3%**, the **QBI deduction**, home-office limits, etc.)? Should we surface SE tax / QBI at
  all, or explicitly say "before those"?

## 10. Cash vs accrual / timing
- We group by document date. For a cash-basis filer, is **payment date** (not invoice date) the
  correct deduction date? Should we distinguish invoice vs paid date?

## 11. Category → Schedule C line mapping (confirm the debatable ones)
Please confirm or correct these defaults:
- Software / SaaS / subscriptions → **Line 22 Supplies** (or should it be 27b Other?)
- Internet / phone → **Line 25 Utilities**
- Advertising / marketing / design / printing → **Line 8 Advertising**
- Legal / accounting / professional services → **Line 17**
- Rent / coworking → **Line 20b**
- Insurance → **Line 15** (and confirm **self-employed health insurance** is an *adjustment to
  income*, NOT a Schedule C line)
- Education / training / conferences → **Line 27b Other** (and the "maintains/improves current
  skills" rule)
- Bank fees / dues → **Line 27b**
- Uncategorized items — we currently default them to **27b Other, fully deductible** — is that a
  safe default or should they be flagged/excluded?

## 12. Substantiation & disclaimers
- For meals, travel, vehicle — what substantiation should we remind users to keep?
- What **disclaimer language** would you want on a tool like this (organizer, not tax advice;
  figures are estimates; confirm with a preparer)?

---
Priority if she's short on time: **#1, #3, #4, #6, #7, and #9** move the numbers the most.
