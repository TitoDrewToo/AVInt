# P0 Rebuild Draft — Reports, Workflows, and Output Generators

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Output architecture draft; existing tax reports remain operational.

## 1. Output model

Reports should become one type of output, alongside dashboards, exports, exception lists, briefs, and workflow actions.

```text
profile
  → query/scope contract
  → validated calculation context
  → output template
  → output run
  → artifact + evidence + status
```

## 2. Output template

An output template should define:

- name and purpose;
- profile and schema version;
- source scope;
- record scope: all, new, changed, unresolved, date range, or selected source;
- fields and calculations;
- grouping and ordering;
- narrative sections;
- artifact formats;
- evidence requirements;
- approval requirements;
- recurrence or schedule;
- template version and activation state.

An inferred template from a sample report must become a versioned specification, not an untracked prompt.

## 3. Generator boundaries

### Deterministic query/calculation layer

Owns ownership, workspace scope, profile scope, date scope, changed-record detection, aggregation, and policy rules. This is where financial math and other sensitive calculations must remain deterministic.

### Rendering layer

Owns Markdown, HTML, CSV, JSON, PDF, dashboard-widget, and evidence-package rendering. Renderers consume the same output model so on-screen results and exports do not diverge.

### Narrative layer

May use an LLM for explanations, summaries, prioritization language, and unusual narrative. It receives bounded validated facts and source references; it does not decide authorization or silently invent calculations.

### Approval/action layer

Owns human approval, notifications, write-backs, and downstream actions. Actions should be opt-in and auditable.

## 4. Existing report migration

The current tax, business-expense, P&L, contract, and accounting exporters should initially remain domain-specific adapters. Their shared query context and evidence model should gradually move into the universal output layer.

The first generalized native output should be simple: a founder weekly delivery brief with Markdown and CSV outputs.

## 5. Claude/MCP contract

The generic MCP surface should eventually support:

- profile discovery;
- schema and field descriptions;
- bounded record queries;
- new/changed record queries;
- evidence retrieval;
- reconciliation status;
- output-template discovery;
- output execution;
- artifact retrieval.

Write and execution tools require explicit permission, idempotency keys, bounded scope, and audit events.

The product advantage over direct Claude usage is that Claude receives maintained, permissioned, validated context and can trigger repeatable outputs without the user rebuilding context every session.
