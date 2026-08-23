# P0 Rebuild Architecture Draft — Smart Storage Flow, Generalized AVIntelligence Core

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Architecture draft for discussion; not an implementation or migration instruction.

**Purpose:** Define how AVIntelligence can remain on the existing Smart Storage flow while changing the post-ingestion system from tax-specific processing into a reusable personal-work and job-function platform.

## 1. Direction

The existing Smart Storage flow remains the product spine:

```text
source
  → inbox and security screening
  → preserved source object
  → extraction
  → normalized structured data
  → validation and reconciliation
  → reusable workflow/output
  → dashboard, report, export, or Claude/MCP result
```

The rebuild changes the meaning of the structured-data and output layers. Tax reports remain a supported domain adapter, but the universal core is designed first around Andrew's internal job-function workflow.

## 2. Architectural layers

### Layer A — Source and ingestion

Owns uploads, API-submitted files, structured records, source connections, checksums, source identity, security screening, storage, ingestion runs, retries, and processing status.

### Layer B — Profiles and virtual records

Owns user-facing logical tables, schema versions, field definitions, mappings, record identity, typed values, corrections, validation, reconciliation, and evidence links.

### Layer C — Workflows and outputs

Owns reusable workflow templates, scopes, schedules, output specifications, deterministic calculations, generated artifacts, approvals, and run history.

### Layer D — Surfaces

Owns Smart Storage, dashboards, native reports, exports, and authenticated Claude/MCP access. These surfaces consume the same profile and output contracts.

## 3. First vertical slice

The first generalized workflow should be an internal founder profile, not a multi-industry launch:

```text
synthetic or authorized work records
  → Founder Operations profile
  → schema-approved records
  → validation and changed-record detection
  → Weekly Delivery Brief template
  → native Markdown/CSV output
  → source-linked evidence
  → optional Claude/MCP retrieval
```

The four role profiles in P0 are later validation profiles. They must use the same contracts rather than receive separate implementations.

## 4. Migration posture

Do not rename, drop, or broadly rewrite the current tax tables first. Use this sequence:

1. Inventory live schema, RLS, functions, routes, reports, dashboards, deletion, and usage dependencies.
2. Define generic contracts and adapters beside the current Smart Storage contracts.
3. Add new profile/run/record/output structures.
4. Dual-write only where the new structure has a clear canonical meaning.
5. Build one founder-profile workflow and retain the tax path as a regression suite.
6. Move readers one surface at a time to the generic contracts.
7. Deprecate old names only after migration, deletion, export, and rollback tests pass.

## 5. Non-goals for the first rebuild

- Replacing the current tax math or accounting exports.
- Building real-time workforce integrations.
- Creating arbitrary user-defined SQL tables.
- Letting an LLM write unrestricted queries or calculations.
- Replacing Claude as a general-purpose reasoning interface.
- Making enterprise claims before workspace authorization, provenance, reconciliation, and deletion are verified.

## 6. Decision gates

The architecture is ready for implementation when the team agrees on:

- the logical meaning of a profile and record;
- record identity and upsert behavior;
- schema evolution and record-version behavior;
- source authority and conflict handling;
- the workspace/RLS model;
- the native output contract;
- what Claude may read, write, and execute through MCP;
- the founder-profile acceptance test.
