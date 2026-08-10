# Tax Source Baseline

This is not a substitute for tax law research. Use it as the minimum source baseline before changing AVIntelligence tax-bundle behavior.

## Primary Sources

- IRS Schedule C instructions:
  `https://www.irs.gov/instructions/i1040sc`
- IRS Schedule C landing page and current form links:
  `https://www.irs.gov/forms-pubs/about-schedule-c-form-1040`
- IRS Publication 334, Tax Guide for Small Business:
  `https://www.irs.gov/publications/p334`
- IRS Publication 463, Travel, Gift, and Car Expenses:
  `https://www.irs.gov/publications/p463`
- IRS Publication 583, Starting a Business and Keeping Records:
  `https://www.irs.gov/publications/p583`

## Practical Rules For AVInt

- Schedule C is for income or loss from a sole proprietorship or business activity. Wages are not the Schedule C base.
- Deductible business expenses must generally be ordinary and necessary for the trade or business.
- If an expense is partly business and partly personal, the personal portion is generally not deductible.
- Business meal expenses are generally limited to 50% when otherwise deductible; entertainment is generally nondeductible.
- Records must clearly show income and expenses and support the amounts reported.
- Separate records are important when multiple activities or income sources exist.
- Tax preparation/professional fees related to the business may be Schedule C expenses, but personal portions should be separated.
- Other expenses belong in Schedule C Part V/Line 48 and flow to Line 27b; do not use Line 27a as a generic fallback.

## AVInt Product Framing

Use language like:

- "Schedule C-oriented worksheet"
- "pre-filing summary"
- "for accountant/preparer review"
- "documented records"
- "needs review"
- "not tax advice"
- "not an official filing document"

Avoid language like:

- "file this directly"
- "guaranteed deductible"
- "verified withholding"
- "official W-2/1099"
- "tax return complete"
- "Line 31 calculation"

## Source Refresh Rule

Before changing line mappings, meals treatment, statutory adjustment language, depreciation/election language, or filing-year-specific values, re-check the IRS source pages for the target tax year. If the product supports multiple years, keep year-specific values out of hard-coded UI copy unless a year selector drives them.
