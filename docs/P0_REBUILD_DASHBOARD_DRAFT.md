# P0 Rebuild Draft — Dashboard and Workspace Surfaces

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Dashboard architecture draft; current Smart Dashboard remains available during migration.

## 1. Dashboard role

The dashboard should evolve from a fixed financial analytics surface into a visual projection of a selected profile and its active workflows.

It should answer:

- What changed?
- What requires attention?
- What is unresolved or stale?
- What work is due?
- What output can be run next?
- Which source evidence supports this view?

## 2. Dashboard layers

### Workspace shell

Provides profile selection, source status, ingestion health, permissions, recent runs, unresolved items, and output history.

### Profile view

Provides table/list views over virtual records, filters, record detail, version history, corrections, and evidence.

### Workflow view

Provides active templates, schedules, last-run status, changed-record scope, approvals, and failure/reconciliation state.

### Widget projection

Uses validated widget specifications, but widget data must come from the same query/calculation engine as native reports. An LLM may propose widget shape and narrative; it may not supply unverified numbers.

## 3. Existing dashboard disposition

Retain `advanced_widgets`, `dashboard_layouts`, `context_summaries`, and `user_analytics_profile` as compatibility projections. Add references to profile, schema version, query scope, and output/run provenance as the generalized model stabilizes.

The financial dashboard becomes the first domain dashboard. It should not be rewritten until the founder profile proves that the dashboard primitives work for non-financial records.

## 4. First founder dashboard

The first generalized dashboard can contain:

- active initiatives and delivery status;
- work items due or blocked;
- stakeholder requests by state;
- capacity allocation;
- automation health;
- data-quality issues;
- recent changes;
- one-click Weekly Delivery Brief generation.

Use synthetic data for public demos and a separate private profile for authorized personal/work data.

## 5. Interaction with Claude

Claude should be able to inspect the same profile and output context through MCP. The dashboard remains valuable because it provides persistent visual state, correction, approvals, run history, and evidence. Claude adds conversational exploration and higher-level reasoning.
