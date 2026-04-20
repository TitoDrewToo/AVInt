# Advanced Analytics — Correlation Catalogue

## Purpose

This document is the inventory of analytic correlations AVInt can produce from its current normalized data. It is the superset from which:

- the standard Advanced Analytics families (see `advanced-analytics.md`) draw their outputs,
- the R&D analytics layer picks cross-doc, raw_json, and anomaly angles, and
- the hero drill-down shortlist (see `advanced-analytics-drilldowns.md`) is selected.

It is not a feature list and not a delivery schedule. It is a reference for what is analytically possible today, what would require normalization work to unlock, and which renderer each correlation belongs to.

Each entry records:
- the analytic question,
- the signals it consumes,
- a consumer-excitement score (1–5) representing how "screenshot-worthy" or subscription-driving the output is for a consumer audience,
- the intended renderer: `Recharts-pushed`, `Three.js hero`, `Map`, `Callout`, `Timeline`, or `List/Table`.

Entries marked **`Three.js hero`** appear in the hero drill-down shortlist in `advanced-analytics-drilldowns.md`. Everything else stays on pushed-Recharts (or a supporting surface).

## Signal Foundation

All correlations below draw from the normalized layer already persisted:

- `document_type`, `document_date`, `period_start`, `period_end`
- `currency`, `jurisdiction`
- `vendor_name`, `vendor_normalized`, `employer_name`, `counterparty_name`
- `total_amount`, `gross_income`, `net_income`, `tax_amount`, `discount_amount`
- `expense_category`, `income_source`, `payment_method`
- `invoice_number`, `line_items`, `classification_rationale`, `confidence_score`
- `raw_json` (reserved for the R&D layer — not used by the default widget generator)

Gaps that block specific correlations are listed at the end of this document. They match the gaps in `advanced-analytics-drilldowns.md`.

## A. Vendor / Brand Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Top-N vendor concentration ("your 5 vendors = 63% of spend") | `vendor_normalized`, `total_amount` | 3 | Recharts-pushed |
| Vendor ecosystem map — which vendors cluster together (same day / same category) | `vendor_normalized`, `document_date`, `expense_category` | 5 | **Three.js hero** (orbit) |
| Loyalty vs exploration — recurring vs one-shot vendors | `vendor_normalized`, `document_date` | 4 | Recharts-pushed |
| Vendor discovery rate — new vendors per month | `vendor_normalized`, `document_date` | 3 | Recharts-pushed |
| Ghost vendors — appeared once, never again | `vendor_normalized`, `document_date` | 4 | List/Table |

## B. Merchant-Domain Layer

Domain taxonomy per `advanced-analytics-spendpack.md` (Food, Grocery, Fashion, Gadgets, Travel, SaaS, Utilities/Telecom, Transport/Fuel/Rideshare, Office, Health). Requires `merchant_domain` as a first-class field for full fidelity — see Data Gaps.

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Domain composition over time | `expense_category` (or `merchant_domain`), `document_date` | 3 | Recharts-pushed (stacked) |
| Domain drift — biggest movers month-over-month | `expense_category`, `document_date` | 4 | Recharts-pushed |
| Essential vs discretionary ratio | `expense_category` | 4 | Recharts-pushed |
| Domain-ecosystem orbit — domains as masses, vendors orbiting | `vendor_normalized`, `expense_category`, `total_amount` | 5 | **Three.js hero** (orbit) |

## C. Payment Method Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Payment method share over time | `payment_method`, `document_date` | 2 | Recharts-pushed |
| Payment method × domain matrix — which card dominates which category | `payment_method`, `expense_category` | 4 | Recharts-pushed (heatmap) |
| Discount rate by payment method | `payment_method`, `discount_amount`, `total_amount` | 4 | Recharts-pushed |
| Average ticket size by payment method | `payment_method`, `total_amount` | 3 | Recharts-pushed |
| Payment-method shift (e.g., moving off cash onto cards) | `payment_method`, `document_date` | 4 | Recharts-pushed (sankey-style) |

## D. Discount Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Total saved YTD | `discount_amount` | 5 | Hero stat tile |
| Top-discount vendors | `vendor_normalized`, `discount_amount`, `total_amount` | 4 | Recharts-pushed |
| Discount rate by domain | `expense_category`, `discount_amount`, `total_amount` | 3 | Recharts-pushed |
| Discount-anchor effect — did the discount drive a larger ticket at the same vendor? | `vendor_normalized`, `discount_amount`, `total_amount` | 5 | Recharts-pushed (dual scatter) |
| Discount-heavy vs full-price vendor map | `vendor_normalized`, `discount_amount` | 4 | Recharts-pushed |

## E. Geography Layer

Strict compliance with the spend-geography guardrail in `advanced-analytics.md` — merchant/transaction location only. No movement, route, or tracking narratives.

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Home-base spend zone | merchant address (from `raw_json`/`line_items`), `total_amount` | 4 | Map (2D) |
| Travel spike clustering — inter-city spend | address signal, `document_date`, `total_amount` | 5 | Map or **Three.js hero** (constellation) |
| Domain × neighborhood concentration | address, `expense_category`, `total_amount` | 4 | Map heat |
| Average ticket by neighborhood | address, `total_amount` | 3 | Map heat |
| Spending constellation — dots in space, size = spend, glow = frequency, color = domain | address, `total_amount`, `expense_category` | 5 | **Three.js hero** (constellation) |
| Fuel / transit price map — brand × branch price comparison | `vendor_normalized`, address, `total_amount`, `line_items` unit quantity when available, `document_date` | 5 | Map (primary); **Three.js hero** (secondary constellation variant) |

**Fuel accuracy constraint:** a per-liter comparison requires unit-quantity fields on receipts (liters, gallons). When unit quantity is present on enough records at a vendor, the drill may present "price per liter" and label it as such. When missing or sparse, the drill must present "average ticket per branch/brand" and be labeled accordingly. This mirrors the project standard against overstating the accuracy of underlying math.

## F. Income Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Gross vs net delta (effective take-home rate) | `gross_income`, `net_income` | 4 | Recharts-pushed |
| Income source stability (wage variance) | `income_source`, `gross_income`, `document_date` | 3 | Recharts-pushed (banded) |
| Income vs expense cadence — do you spend up to paycheck? | `gross_income`, `total_amount`, `document_date` | 5 | Recharts-pushed (composed) |
| Payday ripple — categories hit 24–72h after income | `gross_income`, `document_date`, `expense_category`, `total_amount` | 5 | Recharts-pushed |
| Net position drift | `gross_income`, `total_amount`, `document_date` | 3 | Recharts-pushed |

## G. Time-Shape Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Weekday vs weekend spend mix | `document_date`, `total_amount`, `expense_category` | 4 | Recharts-pushed |
| Early-month vs late-month pattern | `document_date`, `total_amount` | 3 | Recharts-pushed |
| Dormant stretches (no spend anywhere) | `document_date` | 3 | Timeline |
| Temporal rhythm field — calendar as heightfield, height = spend, color = dominant domain | `document_date`, `total_amount`, `expense_category` | 5 | **Three.js hero** (rhythm field) |

## H. Cross-Document / raw_json Layer

This axis is R&D analytics layer territory — cross-document reasoning over `raw_json` and the normalized layer together.

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Subscription overlap — two SaaS tools serving the same purpose | `vendor_normalized`, `expense_category`, recurrence detection | 5 | Recharts-pushed + Callout |
| SaaS price creep — same subscription rising over time | `vendor_normalized`, `total_amount`, `document_date` | 5 | Recharts-pushed (line) |
| Contract obligation timeline — upcoming renewals and auto-renewals | `counterparty_name`, `period_end`, `line_items` | 5 | Timeline |
| Missing recurring — expected monthly bill not seen this period | `vendor_normalized`, `document_date` cadence | 5 | Callout |
| Counterparty network — who pays whom, directional graph | `vendor_normalized`, `counterparty_name`, `employer_name` | 4 | Three.js graph (candidate; not in current shortlist) |

## I. Anomaly Layer

| Correlation | Signals | Excitement | Renderer |
|---|---|---|---|
| Biggest single-day spend | `document_date`, `total_amount` | 5 | Hero stat |
| New vendor on unusually large ticket | `vendor_normalized`, `total_amount` | 5 | Callout |
| Category drift anomaly (e.g., fashion 3× baseline) | `expense_category`, `document_date` | 4 | Recharts-pushed (banded) |
| Anomaly pulse field — transactions as particles, outliers flare on click | `document_date`, `total_amount`, `expense_category` | 5 | **Three.js hero** (anomaly pulse) |

## J. Consumer-Excitement / "Wrapped" Layer

Highest subscription-driving surface. Most shareable.

| Moment | Signals | Excitement | Renderer |
|---|---|---|---|
| Vendor hall-of-fame (top 10 with glow) | `vendor_normalized`, `total_amount` | 5 | **Three.js hero** (recap chapter) |
| Spender archetype ("The Recurring Essentialist") | multiple | 4 | Callout + supporting Recharts |
| You saved $X this year | `discount_amount` | 5 | Hero stat |
| Biggest splurge moment | `total_amount`, `document_date` | 5 | Hero callout |
| Year-in-review recap scene | all | 5 | **Three.js hero** (recap) |

## Renderer Decisions — Why These Splits

The renderer choice for each row is not stylistic. It follows these rules:

- **Three.js hero** only where depth, physics, spatial interaction, or cinematic pacing genuinely add meaning the 2D form cannot deliver (concentration fields, spatial constellations, time heightfields, anomaly pulses, recap scenes). Six surfaces total (see `advanced-analytics-drilldowns.md`).
- **Recharts-pushed** for everything with a standard analytic grammar (time series, composition, comparison, scatter, sankey-style flows, heatmaps) — pushed with SVG gradients, glow, custom shapes, real interactivity, and sphere-inspired motion.
- **Map** for location-anchored spending where the 2D geographic form is correct. A Three.js variant is acceptable only where it layers on top of the same data (e.g., fuel constellation secondary view).
- **Timeline** for dated event sequences (contracts, renewals, dormant stretches).
- **Callout / Hero stat / List-Table** for single-number surfaces or enumerations where a chart would add nothing.

3D versions of standard bar/line/area/pie are **excluded** everywhere — they distort value perception and are a well-known data-viz anti-pattern.

## Data Gaps

These normalization gaps block specific high-value correlations. They are the obvious next upgrades when the decision is made to commit to deeper analytics.

1. **Merchant address / city / neighborhood as first-class normalized fields.** Currently inside `raw_json` / `line_items`. Required for: spending constellation, fuel/transit price map, home-vs-travel analytics, domain × neighborhood views.
2. **`merchant_domain` as its own column.** Currently folded into `expense_category`. Required for full-fidelity domain orbit and domain-aware analytics across the pipeline.
3. **Recurrence flag and cadence on normalized records.** Detected but not persisted. Required for: subscription overlap, missing-recurring detection, SaaS price creep.
4. **Line-item unit fields (quantity, liters, gallons, unit price).** Inconsistently captured. Required for: defensible per-unit comparisons (fuel price-per-liter, grocery unit pricing, any per-quantity analytic).
5. **Anomaly flag on normalized records.** Derived today at read time; persisting would let anomaly pulse fields scale past in-memory computation.

## Selection Principles

When the pipeline (standard generator or R&D analytics layer) is choosing which correlations to surface in a given run, these principles apply — in addition to the novelty rules in `lib/advanced-analytics-config.ts`:

- Prefer correlations that draw on signals the user's workspace actually supports at sufficient density.
- Prefer correlations that reveal a story the standard dashboard does not tell.
- Prefer correlations with consumer-excitement ≥ 4 when the user is on a consumer-facing surface (Smart Dashboard, Advanced Analytics); reserve lower-excitement correlations for reports and accountant-grade contexts.
- Do not nominate a **Three.js hero** surface unless its activation threshold in `advanced-analytics-drilldowns.md` is met.
- Do not produce multiple correlations that answer the same question with different skins — the same novelty rule that already applies to the standard generator applies here.

## Related Documents

- `advanced-analytics.md` — pipeline direction, chart families, novelty and data-sufficiency rules, spend-geography guardrail.
- `advanced-analytics-drilldowns.md` — hero drill-down prescription, activation thresholds, renderer split rule, build order.
- `advanced-analytics-spendpack.md` — stress-test corpus design and merchant-domain taxonomy.
