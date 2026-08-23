# P0 Rebuild Draft — Storage, Tables, and Virtual Records

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Conceptual data-model draft; table names are provisional.

## 1. Core rule

“Virtual table” is a logical profile, not a PostgreSQL table created for each customer. Physical tables remain shared and tenant-safe. The model must avoid both bespoke physical schemas and an unvalidated JSON bucket.

## 2. Proposed entity model

```text
workspace
  ├── members and roles
  ├── sources and connections
  ├── profiles
  │     └── schema versions and field definitions
  ├── ingestion runs
  │     └── ingestion items and source objects
  ├── virtual records
  │     └── immutable record versions and corrections
  ├── workflow templates and runs
  ├── output templates and runs
  └── audit/reconciliation events
```

## 3. Candidate tables

### Workspace and authorization

- `workspaces`
- `workspace_members`
- `workspace_roles` or role columns with explicit permission checks

Every user-owned profile should be representable as a personal workspace. Firm-specific access can later become a workspace adapter rather than the universal authorization model.

### Sources

- `source_connections`
- `source_objects`
- `files` as the initial document/source-object compatibility layer

`google_drive_connections` should eventually become one connection adapter. Existing files should retain their original storage path and source metadata during migration.

### Profiles

- `data_profiles`
- `profile_schema_versions`
- `profile_fields`
- `profile_mappings`
- `profile_validation_rules`

A profile should define identity keys, field types, allowed values, source authority, freshness rules, conflict rules, and supported output scopes.

### Records

- `virtual_records`
- `record_versions`
- `record_values` only if field-level querying requires it
- `record_corrections`
- `record_evidence`

The record payload may use JSONB for flexible values, but the active schema must validate it. Common filter, sort, identity, and aggregation fields should have typed/queryable representations.

### Runs and outputs

- `ingestion_runs`
- `ingestion_items`
- `workflow_templates`
- `workflow_runs`
- `output_templates`
- `output_runs`
- `output_artifacts`
- `reconciliation_results`
- `audit_events`

## 4. Existing-table disposition

| Existing area | Direction |
|---|---|
| `files` | Retain as source-document compatibility layer; gradually add source/run/version metadata. |
| `document_fields` | Preserve for tax compatibility; do not make it the universal record model. |
| `processing_jobs` | Retain during transition; introduce run/item semantics and idempotency. |
| `folders` | Clarify whether they are storage organization, source scope, or profile scope. |
| `google_drive_connections` | Adapt toward generic connections after contract definition. |
| `firms`, `firm_admins`, `firm_clients` | Preserve for current inquiries; evaluate as a legacy workspace adapter. |
| dashboards/widgets | Retain as output projections; add profile/query references. |
| tax/report tables | Preserve as domain modules. |

## 5. Record-version rules

Records should be append-versioned:

```text
logical record
  → version 1 from source A
  → version 2 after source refresh
  → version 3 after approved correction
```

The active version is a projection. Historical versions remain available for provenance, comparison, rollback, and audit. Manual corrections must never erase the source-derived value.

## 6. RLS direction

Every new table should carry a workspace boundary or a direct ownership boundary during transition. Service-role Edge Functions may cross tables only after validating the requested workspace, profile, source, or record relationship. MCP authorization must resolve permissions from the same workspace model rather than rely only on signed-in user identity.

## 7. Deletion and retention

Deletion must be defined across:

- source objects and storage paths;
- extraction artifacts;
- record versions and evidence;
- workflow/output artifacts;
- audit events;
- provider-side temporary processing references.

The deletion contract must distinguish user-requested deletion, source removal, record supersession, and legal/operational retention.
