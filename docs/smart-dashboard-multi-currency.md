# Smart Dashboard Multi-Currency Model

## Purpose

Smart Dashboard should be multi-currency native.

The dashboard must not force all financial activity into a single global currency, and it must not add unlike currencies into one money total. If a user has PHP income and USD spending, those are separate financial realities unless explicit FX conversion exists.

The near-term product goal is not currency conversion.
The near-term goal is correct separation, clear visual grouping, and richer context.

## Core Principle

Do not mix currencies in monetary totals.

Count-based views may remain global. Money-based views must be currency-aware.

Examples:
- document count can combine PHP, USD, EUR, etc.
- income total must be per currency
- expense total must be per currency
- net position must be per currency
- income vs expense trend must be per currency
- tax exposure must be per currency

## Why This Matters

Users may naturally have multiple currencies:
- local salary in PHP and online services in USD
- freelance revenue in USD and daily expenses in PHP
- travel expenses in EUR or GBP
- business purchases across countries

This is not an edge case. It can be a meaningful signal.

Multi-currency context can reveal useful behavior:
- income is PHP, but cloud/SaaS expenses are USD
- local daily spend is stable, but USD subscriptions are growing
- one currency is mostly wage income while another is mostly business revenue
- foreign-currency spending clusters around travel, software, imports, or subscriptions

## Current Issue

The current Smart Dashboard currency behavior is too shallow.

It selects dashboard currency from the first returned `document_fields` row:

```ts
const currency = fields[0]?.currency ?? "USD"
```

This is wrong because:
- database row order is not a product signal
- the first row may have null or stale currency
- the user's dominant data may be PHP, but the dashboard can show USD
- mixed-currency totals can become mathematically misleading

## Data Source

Use normalized `document_fields.currency`.

Relevant fields:
- `currency`
- `document_date`
- `total_amount`
- `gross_income`
- `net_income`
- `tax_amount`
- `expense_category`
- `income_source`
- `files.document_type`

Amounts should remain in their original detected currency.
Do not FX-convert unless a future explicit conversion system is added.

## Currency Buckets

Smart Dashboard should derive a currency-bucketed data model from document fields.

Target shape:

```ts
type DashboardCurrencyBucket = {
  currency: string
  totalIncome: number
  totalExpenses: number
  netPosition: number
  savingsRate: number
  taxExposure: number
  taxRatio: number
  monthlyData: Array<{
    month: string
    income: number
    expenses: number
  }>
  categoryData: Array<{
    name: string
    value: number
  }>
}

type DashboardCurrencyModel = {
  currencies: string[]
  primaryCurrency: string
  buckets: Record<string, DashboardCurrencyBucket>
  hasMultipleCurrencies: boolean
}
```

## Primary Currency

Primary currency is only a default display preference.
It must not be used to collapse all data into one currency.

Suggested primary currency scoring:
1. income volume by currency
2. if no income exists, expense volume by currency
3. if still tied or empty, total absolute activity by currency
4. fallback: `USD`

This aligns with the idea that income often defines the user's financial base, while spending behavior remains important context.

## Number Cards

Money KPI cards should become currency-specific.

If only one currency exists:
- `Income`
- `Expenses`
- `Net`
- `Tax Exposure`
- `Tax Burden Rate`

If multiple currencies exist:
- `Income · PHP`
- `Income · USD`
- `Expenses · PHP`
- `Expenses · USD`
- `Net · PHP`
- `Net · USD`
- `Tax Exposure · PHP`
- `Tax Exposure · USD`

The UI should avoid overwhelming the first viewport. If many currencies exist, prioritize the top currencies by activity and provide a currency selector or expandable detail.

## Trend Charts

Income vs Expenses must be currency-aware.

Recommended first implementation:
- chart header includes currency tabs when multiple currencies exist
- examples: `PHP | USD | EUR`
- selected tab controls the chart's `monthlyData`
- the chart title should indicate the currency context, such as `Income vs Expenses · PHP`

Later enhancement:
- auto-create separate chart widgets for major currencies when useful
- allow users to pin currency-specific chart cards

Do not plot PHP and USD values on the same y-axis as if they are comparable.

## Expense Category Visuals

Expenses by Category should be separated by currency.

Recommended first implementation:
- category chart uses the selected dashboard/chart currency
- title: `Expenses by Category · PHP`
- if multiple currencies exist, provide the same currency selector pattern

Why:
- spending behavior is meaningful inside each currency context
- PHP groceries and USD software subscriptions tell different stories

## Count-Based Widgets

Document Distribution can remain global because it counts records, not money.

Examples that may remain cross-currency:
- document type distribution
- number of files uploaded
- processing status counts
- confidence distribution

If a count-based chart includes money in the tooltip or labels, that money must be currency-specific.

## Tax Widgets

Tax Exposure and Tax Burden Rate must be currency-specific.

Do not combine tax exposure across currencies without explicit FX conversion.

If multiple currencies are detected, the dashboard should show:
- tax cards per currency, or
- a currency selector on the tax widget

## Advanced Analytics Implications

Advanced Analytics should treat currency as a real analytic dimension.

Good future insights:
- `Most PHP spending is daily operating expense, while USD spending is concentrated in software and subscriptions.`
- `USD expenses are growing faster than PHP expenses.`
- `Income is primarily PHP, but recurring spend includes USD SaaS payments.`
- `Foreign-currency spend appears episodic and tied to travel/import categories.`

Bad future insights:
- `Total spending is 50,000` when that value mixes PHP and USD
- `Net position improved` when net is computed across mixed currencies
- single-currency symbols on mixed-currency totals

## UX Copy

When multiple currencies exist, show a small trust note:

```text
Multiple currencies detected. Money totals are separated by currency; no FX conversion is applied.
```

Avoid alarming language. This is normal user behavior and can enrich the dashboard.

## Implementation Notes

Suggested build sequence:
1. replace single `kpi.currency` logic with a derived currency model
2. compute money buckets by currency
3. choose `primaryCurrency`
4. render KPI cards from active/top currency buckets
5. add chart-level currency selector for money charts
6. keep document distribution global
7. add mixed-currency trust note

Important:
- keep existing single-currency users visually unchanged
- do not introduce FX conversion
- do not aggregate monetary values across currencies
- avoid hardcoding PHP as the default, even though PH users are common
- fallback to USD only when no currency signal exists

