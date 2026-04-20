# Advanced Analytics

## Current Directive

Advanced Analytics is now at a baseline state.

That baseline is considered established.

The current objective is not to revisit failed early implementations or to re-argue whether Advanced Analytics should exist.
The current objective is to enrich and upgrade the quality of Advanced Analytics outputs from this baseline.

This means future work should focus on:
- stronger analytic novelty
- richer chart families when justified
- better use of normalized document history
- merchant-domain and spend-pattern intelligence
- concentration, drift, anomaly, and composition shifts
- clearer user-facing usefulness instead of chart volume

This document should be read with the following priority:
1. baseline is established
2. output enrichment is the active roadmap
3. obsolete or abandoned early directions should not be revived unless explicitly re-approved

## Relationship to Smart Dashboard

Smart Dashboard and Advanced Analytics are intentionally complementary, not duplicative.

Strategic framing:
- financial visuals are the interface
- AI-derived context is the differentiator
- Advanced Analytics is the pipeline that feeds that context

Smart Dashboard is positioned as an AI-contextualized financial workspace. It surfaces the interpretation: what numbers mean, why patterns matter, what risks or opportunities are emerging, and what actions might be worth considering. Advanced Analytics supplies the deeper analytic substrate behind that interpretation — stronger merchant-domain intelligence, composition and concentration views, drift and anomaly detection, tax-readiness lenses, and AI-generated summaries grounded in the user's normalized document history.

Implications:
- Advanced Analytics should not be built as a second dashboard with renamed charts
- Smart Dashboard should not be built as a decorative visuals page detached from this analytic substrate
- the pipeline becomes more valuable as stored documents deepen, and the dashboard surface should reflect that progression

See also:
- `advanced-analytics-drilldowns.md` for the approved hero drill-down surfaces, renderer split (Recharts-pushed vs Three.js), activation thresholds, and the UI-refresh-before-build constraint.
- `advanced-analytics-correlations.md` for the full inventory of analytic correlations (vendor, domain, payment, discount, geography, income, time-shape, cross-doc, anomaly, consumer-excitement) with signals, excitement scores, and renderer targets per entry.

## Do Not Revive

The following patterns are considered obsolete or failed directions unless explicitly re-approved:

- derivative charts that only rename existing standard dashboard views
- multiple widgets that answer the same question with different visual skins
- filler analytics produced only to increase chart count
- weak outputs on sparse data when the correct answer is to produce fewer widgets
- generic chart duplication without materially new business meaning
- map or geography work that drifts into movement behavior, route inference, or location tracking
- AI-generated captions or labels presented as if they were substantive analytics

The upgraded roadmap should build from the existing baseline, not fall back into these patterns.

## Purpose

Advanced Analytics is not supposed to be a renamed version of the standard dashboard.

The baseline dashboard already covers:
- total income
- total expenses
- net position
- tax exposure
- tax burden rate
- monthly income vs expenses
- expense category breakdown
- document distribution

The Advanced Analytics layer exists to do more:
- discover different stories
- use richer historical context
- compare multiple measures at once
- surface composition shifts, concentration, drift, and anomalies
- become stronger as the user accumulates more normalized data over time

## Problem We Are Solving

The initial implementation of Advanced Analytics was functional but too constrained:
- too small a chart vocabulary
- too close to the standard charts
- tendency to produce derivative outputs with new titles rather than new insight

That earlier constrained implementation is useful only as baseline context.
It should not define the direction of future work.

The goal of this system is not to maximize chart count.
The goal is to maximize analytic novelty and usefulness while staying grounded in the actual normalized data AVInt stores.

## Current Data Foundation

AVInt currently stores enough normalized structure to support richer analytics:
- `document_type`
- `document_date`
- `period_start`, `period_end`
- `currency`
- `jurisdiction`
- `vendor_name`, `vendor_normalized`
- `employer_name`
- `counterparty_name`
- `total_amount`
- `gross_income`
- `net_income`
- `tax_amount`
- `discount_amount`
- `expense_category`
- `income_source`
- `payment_method`
- `invoice_number`
- `line_items`
- `classification_rationale`
- `confidence_score`

This supports:
- time series
- composition
- comparison
- concentration
- tax-support views
- operational visibility
- contract / obligation timeline views

## Chart Families

### 1. Time Series

Purpose:
- show how values change over time
- reveal trend, seasonality, drift, and volatility

Examples:
- line chart
- area chart

Good use cases:
- monthly income vs expenses
- net position trend
- expense drift over time
- wage stability vs business volatility

### 2. Composition

Purpose:
- show what makes up the whole
- reveal dominance and concentration

Examples:
- pie chart
- bar chart for composition when labels are dense

Good use cases:
- expense category share
- vendor concentration
- income source mix
- document type distribution
- payment method distribution

### 3. Comparison

Purpose:
- compare multiple measures on the same grouping key
- reveal relationships rather than single totals

Examples:
- bar chart
- line chart
- area chart used in comparative mode

Good use cases:
- gross vs net income
- income vs expenses vs tax amount
- deductible vs non-deductible amount
- vendor spend vs transaction count

## Planned Families

These are approved conceptually but not yet fully rendered in the current dashboard:

### Composed Time Series

Examples:
- line + bar + area combined

Use cases:
- income line + expense bars + net area
- tax amount overlaid on monthly trend

### Banded Time Series

Examples:
- banded chart

Use cases:
- normal range vs actual spend
- volatility envelope for income or expenses

### Stacked Composition

Examples:
- stacked bar chart

Use cases:
- category share by month
- income source mix by month
- deductible composition by period

### Timeline

Examples:
- timeline chart

Use cases:
- contract obligation sequence
- missing-period timeline
- payroll / upload activity cadence

## Variants vs Real Families

These are visual variants, not separate analytic discoveries:
- active-shape pie
- padded pie
- custom-labeled pie
- custom-shaped bars
- axis-labeled composed views

These improve presentation quality but should not be treated as different analytic categories.

## Novelty Rules

Advanced Analytics should never generate multiple widgets that answer the same question with different skins.

Rules:
- no duplicate analytic question in a single run
- no duplicate grouping key unless the business question is materially different
- no duplicate metric pair in a single run
- no repeated family unless the second chart is clearly distinct in both grouping and question
- visual variants do not count as separate discoveries
- if data is too sparse, produce fewer widgets instead of filler

## Data Sufficiency Rules

Not every chart should appear on every dataset.

Examples:
- banded variance views require longer history
- timeline views require real dated events
- stacked composition views require enough distinct categories or sources
- comparison views require meaningful multi-measure support

Sparse data is not a failure.
Weak forced charts are a failure.

## Rollout Philosophy

Phase 1:
- improve the current generator using a stronger family taxonomy
- keep the same endpoint and table
- use existing renderable chart primitives

Phase 2:
- expand renderer support for composed, stacked, banded, and timeline visuals
- add chart variants and richer chart-specific interactions

Phase 3:
- use longer historical memory and richer user profile synthesis
- allow stronger anomaly, drift, and longitudinal insight generation

## Key Principle

Advanced Analytics should feel more intelligent as the user's stored history deepens.

It should not just:
- redraw the same standard charts
- rename the same insight
- use AI as a caption generator

It should:
- identify what matters
- choose the right analytic angle
- use a distinct chart family when warranted
- remain disciplined about novelty and truthfulness

## Future Merchant-Domain Lenses

This is an explicit exploration directive for future Advanced Analytics work.

The system should not stop at generic categories like "expenses" or "vendors" when richer merchant-domain patterns can be inferred.

Examples of merchant-domain lenses worth exploring:
- Food / Restaurants
- Fashion / Apparel
- Gadgets / Equipment
- Travel / Lodging
- Software / SaaS
- Utilities / Telecom

Examples of questions these domain lenses should eventually support:
- spend per merchant domain over time
- which merchant domain is growing fastest
- which vendors within a domain dominate spend
- which domain carries the largest discounts
- which vendors offer the largest discounts over time
- whether discount-heavy vendors correlate with higher total spend
- whether a domain behaves like recurring operational spend or discretionary spend

These are not yet a separate chart family.
They are a directive to push the analytics layer beyond generic totals and into domain-aware pattern detection when the normalized data supports it.

This matters because earlier testing focused heavily on general chart generation and missed more specific merchant-story angles that users may care about directly.

## Regional App and Brand Flexibility

Merchant, brand, and app-based analytics must remain region-flexible.

The concept is consistent:
- identify where spending happens
- identify which brands or merchants dominate inside a given app or payment ecosystem
- identify the purpose of spending within that app context

But the concrete app ecosystem will vary by market.

Example:
- in the Philippines, a user may expect app-specific breakdowns for GCash spending, including brand splits and spending-purpose patterns within the GCash ecosystem
- in the United States, similar analysis may need to center different consumer apps, wallets, or merchant ecosystems instead

The directive is:
- do not hardcode one country's app ecosystem as the universal model
- do not assume US merchant/app patterns are globally representative
- do not assume Philippine wallet/app behavior is globally representative
- preserve the analytic concept while allowing the concrete merchant/app layer to adapt by region

This should guide future analytics such as:
- app-specific merchant concentration
- brand share within a payment or wallet ecosystem
- spending-purpose clustering within a given app context
- cross-brand comparisons inside one consumer platform

The analytic goal is not "GCash charts" or "US wallet charts" as fixed features.
The analytic goal is a region-aware merchant/app lens that can adapt to the dominant platforms in the user's market.

## Example vs Detection Logic

App-specific examples in this document are illustrative only.

They are not meant to hardcode a fixed feature list such as:
- GCash analytics only
- PayPal analytics only
- Venmo analytics only
- region-specific wallet charts as permanent product categories

The actual logic should be:
- if the uploaded data contains strong enough merchant, brand, payment-method, or app-platform signals
- then the analytics layer should be able to detect and elevate those correlations

This means the analytics layer (current and future) should be looking for evidence such as:
- recurring merchant clusters within a platform
- brand concentration inside a payment ecosystem
- spending-purpose patterns associated with one app or merchant layer
- cross-merchant or cross-brand correlations that become visible only after enough uploads accumulate

This should remain data-dependent.

Rules:
- do not force app/platform narratives when user uploads do not support them
- do not treat examples in this doc as mandatory output categories
- do treat them as examples of the broader correlation logic we want the analytics layer to learn

The system should generalize the pattern, not memorize the example.

## Spending Geography Guardrail

Geography-aware analytics are approved for spending analysis only.

This means the map layer may answer questions like:
- where money is spent
- which areas show higher average ticket size
- which areas are more expensive for a given merchant domain
- where spending spikes happen
- where a user's travel-related spending clusters

This means the map layer must not answer questions like:
- where the user moved
- what path a user traveled
- rideshare route behavior
- commute behavior
- personal location tracing

Hard product rule:
- map input = merchant or transaction location tied to spend
- map output = spending intensity, distribution, averages, and domain-specific comparisons
- map exclusion = movement behavior, route reconstruction, or user tracking

Even if a transaction comes from a rideshare or travel merchant, it must still be treated as spending at a merchant/location rather than evidence of movement behavior.

## Map Analytics Scope

The long-term geography roadmap should emphasize spending context, not static map decoration.

Preferred scope:
- local neighborhood / district spending
- crosstown and intra-city spending concentration
- inter-city spend shifts during travel
- occasional regional or international spending
- currency-aware dashboard views for mixed-currency consumer behavior

Recommended progression:
1. merchant/location spend points or clusters
2. neighborhood / district concentration and average spend
3. domain-specific location views
4. later, currency-aware travel spend overlays when the normalized location and currency signals are strong enough

Tax reports should remain strict and should not use mixed-currency aggregation.
Dashboards may become more flexible, preserving original currency in raw/location views and using normalized display currency only where comparative analytics require it.
