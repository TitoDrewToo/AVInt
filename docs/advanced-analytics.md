# Advanced Analytics

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
