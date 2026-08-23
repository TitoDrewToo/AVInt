# P0 Handoff for Claude — Persistent Source-to-Work Continuity

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Internal P0 direction and architecture-review brief
**Owner:** AVIntelligence / Andrew  
**Purpose:** Give Claude the product objectives and constraints needed to review the repository, challenge prior assumptions, and design the appropriate upgrade path.

## How to use this document

This document is strategic context, not an approved implementation specification.

The product objectives and acceptance criteria below are the highest-priority instructions. Older architecture drafts, candidate table names, migration phases, and function proposals are hypotheses only. They may be stale, incorrect, incomplete, or premature. Claude must validate them against the actual repository and live Supabase schema before using them.

Do not pattern-match the existing draft files into an implementation plan. First understand the objective, then inspect the current system, challenge the assumptions, compare architectural options, and recommend the smallest path that proves the value.

## P0 direction

AVIntelligence is redirecting away from being primarily a tax/CPA product. Smart Storage, Smart Dashboard, reports, exports, security, and tax workflows remain valuable capabilities and must be preserved where useful, but tax is no longer the governing architecture or primary market direction.

The product thesis is:

> AVIntelligence turns changing, heterogeneous source material into maintained, source-linked work that Claude, dashboards, reports, and workflows can reuse over time.

The product is not primarily a file store, a generic AI wrapper, a chatbot, an Airtable replacement, or a universal database platform. It is a persistent source-to-work continuity layer.

The core question is:

> After source material changes, does AVIntelligence automatically help Claude produce a better, more current, more repeatable, and more traceable result than a fresh file upload would?

If the answer is not yes, the architecture is not yet proving the product.

## Business value

The first ingestion should continue creating value after the file was initially stored.

AVIntelligence should reduce the repeated cost of:

- uploading the same source material;
- re-explaining the same context;
- rebuilding the same calculations;
- manually comparing versions;
- locating evidence for conclusions;
- recreating reports, dashboards, and prompts.

For API-based Claude usage, persistent structured data and targeted retrieval may also reduce repeated input context and token consumption. This is a supporting economic benefit, not the sole value proposition. For ordinary Claude users, the primary benefits are saved preparation time, freshness, repeatability, and traceability.

The intended commercial model is a low-friction self-serve product with the existing Creem checkout. Claude/MCP discovery, the AVIntelligence website, workflow demonstrations, search-led content, and referrals should lead users into the same account, workspace, and billing system.

## Commercial context and distribution

The initial buyer is not a generic company or an abstract industry. It is a Claude user who repeatedly works with changing files, exports, spreadsheets, PDFs, or operational reports and produces a similar analysis or work product more than once.

The first commercial audience may include analysts, operations staff, managers, consultants, and technically capable individual users. These are behavioral segments rather than separate products. The common problem is repeated source preparation and the loss of continuity between one analysis and the next.

The initial product should be discoverable where this behavior already occurs:

- the official Claude Connectors Directory and custom Claude connector flow;
- MCP registries and developer communities;
- search-led pages addressing recurring Claude file workflows;
- practical demonstrations showing source changes, saved work, and evidence;
- referrals from operations, reporting, data, and AI-workflow consultants.

Product Hunt and broad generic SaaS directories are not assumed to be primary distribution channels. The product should be found through the problem it solves, not through the phrase “virtual tables.”

The intended self-serve path is:

```text
discover a recurring Claude/file workflow
  → connect or create an AVIntelligence workspace
  → receive a useful first result
  → save the work
  → return when source material changes
  → upgrade through Creem when continuity is valuable
```

The connector and website must therefore share one identity, workspace, entitlement, and billing path. Claude discovery is a distribution surface, not a separate product or billing system.

Business and enterprise accounts are a later expansion topic. They may add shared workspaces, administrators, permissions, approvals, API ingestion, governance, support, and procurement requirements, but those concerns must not make the initial individual workflow unnecessarily difficult.

## Economic model and pricing hypothesis

The individual product may retain the existing low-friction Creem pricing during validation. The purpose of that price is adoption and learning, not a final statement about the full value of the platform.

The economic proposition has two layers:

1. Operational value: the user spends less time re-uploading, re-explaining, comparing, calculating, and rebuilding recurring outputs.
2. Context efficiency: the system can reuse normalized data and retrieve only relevant or changed context, potentially reducing repeated Claude input and API-token consumption.

Token savings must be measured rather than promised. Claude subscription users may experience the benefit primarily as capacity, speed, and convenience, while API users may experience direct input-cost savings. AVIntelligence must also track its own extraction, storage, retrieval, and reprocessing costs so that persistent ingestion remains economically viable.

The important economic event is not the first upload. It is continued value from that upload:

```text
initial ingestion cost
  → reusable structured source state
  → multiple questions, outputs, and refreshes
  → lower repeated preparation and context cost
  → increasing value of saved work and source history
```

The architecture should make this compounding value visible through refresh history, changed-record summaries, saved outputs, evidence, and usage metrics.

## Product behavior that matters

The system must support this lifecycle:

```text
source file or API record arrives
  → source identity and version are recorded
  → extraction and validation occur
  → maintained records or datasets are updated
  → affected changes are identified
  → saved work can rerun as refresh, append, or diff
  → Claude, dashboards, reports, and workflows use the same current result
  → output remains linked to source evidence and processing history
```

The user experience should remain file-first and simple. A user should not need to design a database before receiving value. The system may expose virtual tables, profiles, schemas, mappings, and dataset views, but those are implementation and usability mechanisms—not the product headline.

## Architectural north star

The architecture should optimize for durable work value, not platform completeness.

Required capabilities are:

- stable source identity, checksums, timestamps, and idempotent ingestion;
- immutable source references and processing history;
- versioned derived records or dataset views;
- field-, page-, row-, cell-, or region-level evidence where available;
- explicit freshness, validation, confidence, and conflict status;
- saved questions, queries, output definitions, and workflow runs;
- refresh, append, and changed-record execution modes;
- deterministic query and calculation layers shared by dashboards and Claude;
- bounded, source-linked context retrieval for Claude;
- correction and approval history without erasing source-derived values;
- workspace, ownership, permission, deletion, and audit boundaries;
- API-first ingestion for customer-controlled integrations;
- native outputs that remain useful without Claude.

The central success invariant is:

```text
source changes
  → affected records are detected
  → derived intelligence updates
  → saved work reruns
  → Claude and dashboards use the same current data
  → results remain reproducible and traceable
```

## What is fixed, preferred, and open

### Fixed product objectives

- Persistent source-to-work continuity is the primary value.
- The architecture must support multiple roles, tasks, jobs, and workflows.
- The four sample roles are capability fixtures, not four products.
- Smart Storage remains the ingestion and storage flow underneath the new system.
- Tax capability is retained as a domain capability without governing the universal core.
- Files and future API records must be first-class source inputs.
- Claude is an optional reasoning and presentation layer; AVIntelligence owns source identity, permissions, data selection, calculations, workflow state, freshness, and provenance.
- Dashboards, reports, exports, and Claude must consume compatible data and output contracts.
- Creem checkout remains the self-serve billing path.
- The design must support discovery through Claude/MCP and direct web distribution.

### Strong architectural preferences

- Preserve working security, prescan, storage isolation, extraction, provider fallback, reports, dashboards, exports, and account-deletion foundations where they remain correct.
- Prefer additive, reversible migration while the current tax workflow remains operational.
- Preserve raw source and history; do not silently overwrite or destroy prior interpretations.
- Keep AI inference separate from deterministic validation, calculations, querying, and authorization.
- Make source reconciliation and evidence first-class rather than metadata added later.
- Avoid physical tables per user, role, or profile unless live evidence proves they are required.
- Prefer customer-controlled API ingestion for enterprise integrations so customer administrators own compatibility with Azure, SharePoint, internal systems, or other stacks.

### Open design questions

Claude must determine, using repository and live-schema evidence:

- whether the current `document_fields` model should be adapted, projected, or superseded;
- which universal envelope and record/version structures are actually required;
- whether JSONB, typed projections, relational columns, or a hybrid is appropriate;
- where query compilation and aggregation should live;
- whether lexical search is sufficient initially and where semantic retrieval adds value;
- how source identity and record identity should behave across files and API feeds;
- how corrections, conflicts, deletions, and source authority should work;
- how dashboards and reports can share the same query/output layer;
- which current Edge Functions can be generalized and which should remain domain-specific;
- how to preserve tax output parity during migration;
- what the smallest proving vertical slice should be.

## Four role profiles

The four profiles test whether the same core supports different data shapes and workflows. They must not produce separate architectures or bespoke platform primitives.

### BPO RTA/workforce analyst

Recurring staffing, adherence, attendance, schedule, shrinkage, queue, and SLA files or API exports. Example outputs include staffing gaps, adherence exceptions, SLA risk, daily reports, and trend summaries.

### BI/data analyst

Recurring CSVs, spreadsheets, database extracts, KPI exports, and APIs. Example outputs include KPI reports, management packs, change reports, and data-quality exceptions.

### Executive user

Department summaries, operational reports, risks, decisions, and unresolved items. Example outputs include a current executive brief, top changes, required decisions, and evidence.

### Data engineer

Schemas, sample tables, API payloads, stakeholder reports, and mapping requirements. Example outputs include source-to-dataset mappings, reconciliation reports, unmapped fields, duplicate/missing-record reports, and integration plans.

The internal founder profile is private dogfood. Maintain separate private and synthetic instances using the same schemas and workflow templates. Do not use employer, interview, or client data without permission.

## Smart Storage and tax compatibility

The current Smart Storage flow is the foundation:

```text
upload or connector
  → inbox and prescan/security
  → extraction
  → normalization
  → document fields or derived records
  → reports, dashboards, exports, and MCP
```

The tax workflow should remain operational while the generalized layer is evaluated. Tax-specific reports, exporters, assumptions, obligations, and calculations should be preserved as domain modules until parity and rollback are proven.

`document_fields` is not automatically the universal future model. It may remain a tax-compatible projection, be extended, or be replaced by a generalized record model. That decision requires live schema, dependency, RLS, data, and output analysis.

The same applies to proposed generalized tables such as workspaces, profiles, schema versions, source objects, ingestion runs, virtual records, record versions, evidence, workflows, outputs, reconciliation, and audit events. These are candidate concepts, not mandatory names or a pre-approved migration.

## API-first integration posture

The preferred future enterprise path is:

```text
customer systems
  → customer-controlled Power Automate, Azure Function, n8n, ETL, or internal service
  → AVIntelligence ingestion API
```

The API should eventually support raw files and structured records with source identifiers, timestamps, checksums, idempotency keys, profile selection, schema versions, processing status, reconciliation, exports, and callbacks.

AVIntelligence should make virtual datasets easy for administrators to inspect and reconcile with their own systems. The model should expose source IDs, mappings, authority, freshness, unmapped fields, duplicates, missing records, conflicts, and last-received information without requiring AVIntelligence to support every customer technology stack directly.

## Claude and native outputs

Native outputs remain important: summaries, change reports, exception lists, CSV/JSON, standard reports, dashboards, and reconciliation reports.

Claude should add flexible reasoning, narrative, strategy, unusual analysis, and presentation. The MCP interface should expose narrow, bounded, source-linked capabilities such as profile discovery, schema description, record querying, evidence retrieval, change retrieval, saved-work execution, and approved output actions.

The value is not merely connecting Claude to files. It is giving Claude maintained work state that a fresh upload does not provide.

## P0 proof requirement

The first meaningful vertical slice should be generic enough to exercise the architecture but small enough to prove value:

1. Ingest a small set of heterogeneous files.
2. Derive structured records and preserve source evidence.
3. Ask Claude or the native workspace a repeatable question.
4. Save the query and output definition.
5. Add or modify source material.
6. Rerun the saved work.
7. Show current results, changed records, warnings, and evidence.
8. Render the same maintained data in a simple dashboard or report.

The decisive measures are:

- successful changed-source detection;
- evidence accuracy;
- repeatability of output;
- reduced preparation and repeated context;
- saved-work creation;
- second-run return rate;
- continued use or payment after a source refresh.

An upload that produces one good answer proves extraction. A second run that produces a better current answer proves the product.

## Commercial decision gates

The first validation period should measure behavior rather than registrations alone. The minimum funnel is:

```text
connector or workspace activation
  → first successful ingestion
  → useful first result
  → saved question or output
  → source refresh or changed file
  → successful second run
  → continued use, payment, or referral
```

Continue and expand the direction when users return because source material changed, save recurring work, and accept the resulting value proposition without being taught the underlying data model.

Narrow the target workflow or onboarding when users value the first answer but do not save work, return with new source material, or understand why AVIntelligence is better than another Claude upload.

Pause broad platform expansion when users treat the product as a one-off file analyzer, when source refreshes do not produce meaningful improvements, or when ingestion and maintenance costs exceed the recurring value created.

The architecture review should therefore recommend instrumentation for:

- source and workspace activation;
- first successful result;
- saved-work creation;
- time and cost to first value;
- second-source refresh;
- changed-record and evidence accuracy;
- repeated context or token reduction where measurable;
- paid conversion after refresh;
- 30- and 90-day retention;
- referrals or additional users invited.

Technical completion is not commercial validation. A working universal schema without second-run retention is not a successful P0.

## Claude review instructions

Claude should produce the next architecture review in this order:

1. Restate the product and commercial objectives in operational terms.
2. Inspect the actual repository, migrations, functions, routes, tests, and live Supabase schema where available.
3. Map current capabilities, data flows, contracts, dependencies, RLS, and lifecycle gaps.
4. Identify where the current tax-oriented implementation conflicts with the P0 objectives.
5. Separate reusable foundation, tax-domain coupling, missing capability, and uncertain evidence.
6. Compare viable architecture options against continuity, freshness, provenance, reuse, token/context efficiency, migration safety, and operating cost.
7. Recommend the smallest vertical slice that can prove second-run value.
8. Draft the upgrade path for tables, Edge Functions, queries, dashboards, reports, outputs, MCP, and APIs.
9. Specify migration, parity, rollback, security, observability, and acceptance gates.

Do not assume any previous draft is correct merely because it contains detailed table names or phase plans. Do not begin a broad schema rewrite or destructive operation from this document alone.

## P0 success condition

P0 succeeds when AVIntelligence can demonstrate that:

1. the same ingestion foundation supports multiple profiles and workflows;
2. source changes update maintained intelligence without breaking the data chain;
3. saved work can refresh, append, or produce a change diff;
4. outputs and dashboards use the same current data as Claude;
5. important results trace back to source evidence;
6. tax capability remains safe and operational as a domain module;
7. individuals can receive value without company configuration;
8. administrators can reconcile datasets with their own systems;
9. the product creates durable value after initial ingestion;
10. users return because their source material changed.
