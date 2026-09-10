# Smart Storage Schema Reconciliation Implementation Plan

**Status:** Implemented locally; dataset lifecycle migration applied 10 Sep 2026; application and edge deployment pending
**Date:** 10 Sep 2026
**Goal:** Let an authenticated user or connected data engineer reconcile differently shaped owned datasets into one reusable, governed virtual shape without changing source data or requiring a physical database design.

## Product outcome

A user can load several sheets with different headers, declare the useful output shape, map aliases into that shape, ignore irrelevant columns, choose explicit behavior for omitted columns, preview the result, and activate the exact reviewed version for reports, dashboard visuals, relationships, and MCP use.

Example inputs:

```text
calls-september.csv       login, calls, aht_seconds, notes
workforce-export.xlsx     employee_number, call_volume, avg_handle_seconds, team
operations.xlsx           agent_id, interactions, handle_seconds, attendance_status
```

Example output contract:

```text
workforce_activity
  agent_id                text     required
  interaction_count       number   required
  average_handle_seconds  number   optional
  team                    text     optional
  attendance_status       text     optional
```

The source rows and headers remain unchanged. The reconciled shape is resolved at read time and retains file, dataset, sheet, and row provenance.

## Phase 0 — current contracts and allowed APIs

Use these existing contracts rather than creating a parallel query system:

- `lib/data-mapping-definitions.ts`
  - `validateDataMappingProfilePayload`
  - `DataMappingProfileInput`
  - `DataMappingRule`
  - Existing mapping profiles bind one owned records/dataset source, are versioned, and store rules in the existing `mappings jsonb` column.
- `lib/data-mapping-engine.ts`
  - `applyDataMappingProfile`
  - Existing canonical and user-corrected values win over mapped values.
  - Mapping issues and bounded preview samples already exist.
- `lib/data-mapping-service.ts`
  - `previewDataMappingProfile`
  - Preview of the exact version precedes activation.
- `lib/data-mapping-store.ts`
  - Existing create, update, preview-recording, and activation lifecycle.
  - Optimistic version checks and authenticated `user_id` predicates are required.
- `lib/report-definition-engine.ts`
  - `loadReportDefinitionSource`
  - Existing direct dataset unions require an exact `(key, data_type)` signature and retain `__dataset_id`, `__dataset_name`, and `__file_id`.
  - Existing source limit is 5,000 rows.
- `lib/virtual-dataset-definitions.ts`
  - Virtual datasets already provide filters and an explicit projected-field list.
- `lib/data-relationship-*`
  - Relationships remain equality-only, preview-gated, cardinality-checked, namespaced, and bounded to 5,000 projected rows.
- `lib/virtual-model.ts`
  - `readVirtualModel` already returns owned files, datasets, dataset columns, virtual datasets, mapping profiles, relationships, and source capabilities.
- `app/api/mcp/[[...transport]]/route.ts`
  - Existing mapping tools are `list_mapping_profiles`, `get_mapping_profile`, `save_mapping_profile`, `preview_mapping_profile`, and `activate_mapping_profile`.

Do not introduce SQL authoring, executable expressions, JavaScript transforms, arbitrary URLs, cross-user identifiers, silent imputation, or an independent dashboard loader.

## Decisions

### 1. Reconciliation is an extension of mapping profiles

Do not create another competing saved-object type. Extend the existing mapping rule JSON contract additively. The database column is already `jsonb` containing an array, so the reconciliation target/rule contract itself requires no migration.

Legacy rules remain valid and retain current overlay behavior:

```ts
type LegacyDataMappingRule = {
  sourceField: string
  targetField: CanonicalTargetField
  coercion: DataMappingCoercion
}
```

New reconciliation rules use ordered candidates and an explicit target contract:

```ts
type ReconciliationTargetType = "text" | "number" | "date" | "boolean"
type ReconciliationMissingPolicy = "null" | "exclude_row" | "exclude_dataset" | "reject"
type ReconciliationConflictPolicy = "reject" | "first_non_empty"

type ReconciliationCandidate = {
  sourceField: string
  coercion: DataMappingCoercion
}

type ReconciliationRule = {
  targetField: string
  targetType: ReconciliationTargetType
  candidates: ReconciliationCandidate[] // ordered, 1–10
  required: boolean
  onMissing: ReconciliationMissingPolicy
  onConflict?: ReconciliationConflictPolicy // default reject
  role?: "time" | "currency" // at most one of each per profile
}
```

A profile must use either legacy rules or reconciliation rules; mixed rule versions are rejected. Existing persisted profiles do not change behavior.

A `time` role requires a date target and governs report periods. A `currency` role requires a text target and governs monetary separation. Roles are declared, never inferred from a custom field name.

### 2. Custom target fields are allowed, authority fields are not

The current canonical target allowlist is insufficient for `agent_id`, `interaction_count`, `student_id`, and other user-defined models.

Reconciliation `targetField` accepts the existing safe field-name pattern but rejects:

- Names beginning with `__`.
- Ownership, authorization, processing, review-authority, revision, and lifecycle fields.
- Internal identifiers such as `user_id`, `file_id`, `dataset_id`, `record_id`, and storage paths.
- Duplicate target fields.
- Mapping chains where one rule consumes another rule's generated target.

Existing canonical targets retain their authority rule: a present canonical or user-corrected value is preserved and reported as preserved/conflicting, never overwritten.

### 3. Alias candidates are deterministic

For each row, candidates are evaluated in the declared order against the original source row:

```text
agent_id <- agent_id, employee_number, login
```

- Empty candidates are skipped.
- The first successfully coerced value is selected.
- A later successfully coerced candidate with the same value is harmless.
- A later candidate with a different value is a candidate conflict.
- Default conflict behavior is `reject`; `first_non_empty` must be explicitly selected by the engineer and remains visible in preview and coverage.
- A candidate may have the same name as its target. This permits already-conforming sources and is not a mapping chain.
- Coercions must be compatible with `targetType`.

Unit conversion, arithmetic, formulas, aggregation, lookup tables, and AI-authored executable transforms are out of scope for this increment. A source measured in minutes must not be silently combined with a target measured in seconds.

### 4. Missing-column behavior is explicit

`onMissing` applies after all candidates have been checked:

- `null`: retain the row and set the target to `null`. Allowed only when `required` is false.
- `exclude_row`: omit that row and count it by target and source dataset.
- `exclude_dataset`: omit the entire originating dataset when its schema contains none of the candidates. Name it in preview and runtime coverage.
- `reject`: preview may run, but activation is refused if any selected dataset lacks the target structurally or any included row lacks a valid required value.

No policy may synthesize zero, empty text, false, or a guessed category for absent evidence.

### 5. Irrelevant columns never determine compatibility

Direct raw dataset reports retain their existing exact-schema rule for backward compatibility.

Only mapping-profile reconciliation gets a heterogeneous source loader. It loads every owned candidate dataset without selecting a base schema, attaches provenance, then applies the target contract. Compatibility is evaluated against the declared targets, not the complete original headers.

Therefore an extra `notes` column cannot exclude an otherwise usable dataset. Fields not referenced as candidates or requested by a downstream virtual-dataset projection are ignored.

### 6. Provenance survives reconciliation

Every output row retains at least:

```text
__file_id
__dataset_id
__dataset_name
__sheet_name
__row_index
__mapping_profile
__mapping_profile_version
```

Do not copy or persist reconciled rows. Reports, dashboard visuals, and virtual datasets resolve the current owned sources through the active mapping version.

### 7. Recurring folders need an explicit current-dataset lifecycle

The current spreadsheet reconciliation preserves a dataset when a sheet disappears from a reprocessed file. This protects stable dataset IDs, but there is no current/archive marker. A folder loader could therefore include stale rows from a sheet that no longer exists in the current file.

Before folder-targeted reconciliation is enabled in production, add a separately approved migration for `datasets.archived_at timestamptz null` (or an equivalently explicit current-state marker):

- A present sheet is upserted using `(file_id, sheet_name)` and has `archived_at` cleared, preserving its stable ID.
- A previously known sheet absent from the completed re-derivation is archived, not deleted.
- Dataset discovery, raw unions, mappings, virtual datasets, reports, and visuals select current datasets by default.
- A saved definition pinned to an archived dataset fails with `The selected dataset is no longer present in the current source file`; it must never run stale rows silently.
- Historical inspection may show archived datasets, clearly labeled, but they are not eligible for current output.

Do not overload `datasets.updated_at` to infer this state. Do not execute this migration without the repository's schema-approval process.

## Phase 1 — contract and pure reconciliation engine

### What to implement

1. Extend `lib/data-mapping-definitions.ts` with the additive rule union and validators above.
2. Keep legacy normalization exact; normalize new rules into one internal reconciliation representation.
3. Extend `lib/data-mapping-engine.ts` with a pure reconciliation pass that:
   - evaluates original row values only;
   - preserves authoritative existing targets;
   - implements ordered candidate selection;
   - enforces missing and conflict policies;
   - emits output target type metadata;
   - never mutates input rows.
4. Extend preview types with dataset-level and target-level coverage.

Suggested summary contract:

```ts
type ReconciliationPreviewSummary = {
  profileVersion: number
  sourceDatasets: number
  includedDatasets: number
  excludedDatasets: number
  sourceRows: number
  outputRows: number
  excludedRows: number
  activationReady: boolean
  targets: Array<{
    targetField: string
    targetType: ReconciliationTargetType
    datasetsPresent: number
    datasetsMissing: number
    valuesResolved: number
    valuesMissing: number
    typeFailures: number
    conflicts: number
  }>
  datasetOutcomes: Array<{
    datasetId: string
    datasetName: string
    status: "included" | "excluded" | "blocked"
    reasons: string[]
  }>
}
```

Persist only bounded counts and statuses in `preview_summary`. Before/after values and unmatched source values remain response-only samples, as they do today.

### Verification

- Existing mapping tests pass unchanged.
- Legacy profile output is byte-for-byte equivalent.
- Multiple aliases resolve one target deterministically.
- Missing optional values become `null`, never zero.
- Required missing values follow the selected policy.
- Conflicting candidates block activation by default.
- Canonical and user-corrected values still win.
- Unsafe target names, chains, incompatible coercions, and mixed rule versions fail validation.

## Phase 2 — heterogeneous owned-dataset loading

### What to implement

1. Land the approved dataset-current-state migration and update the dataset-layer re-derivation contract before enabling recurring folder reconciliation.
2. Extract dataset discovery/loading from `loadDataset` into reusable owned-source helpers.
3. Preserve the current exact-schema path for ordinary dataset reports and visuals.
4. Add a mapping-reconciliation load path that:
   - resolves `datasetId`, `fileIds`, or folder descendants through existing ownership checks;
   - loads every candidate dataset and its column metadata;
   - does not discard a dataset because of unrelated or omitted columns;
   - attaches the full provenance contract to each row;
   - enforces the existing aggregate 5,000-row limit before reconciliation;
   - returns dataset schemas to the reconciliation engine.
5. Update `previewDataMappingProfile` and active mapping resolution to use this path only for reconciliation profiles.

### Verification

- Foreign, missing, and mixed-owner identifiers remain inaccessible and are not named as foreign.
- Three differently shaped owned datasets enter one preview.
- An extra irrelevant column does not change included dataset or row counts.
- A selected file with no dataset is named as `no dataset`.
- Folder descendants remain included through the existing folder resolver.
- A sheet removed during reprocessing is archived and contributes zero current rows; if it reappears, the same dataset ID becomes current again.
- Direct dataset reports still apply exact-schema compatibility exactly as before.

## Phase 3 — downstream type and coverage contract

### What to implement

1. Extend `LoadedReportDefinitionSource` with optional field type metadata rather than guessing metric suitability from field names.
2. Make active reconciliation profiles expose target fields and declared types to:
   - report-definition validation and execution;
   - dashboard visual validation and execution;
   - virtual-dataset validation and projection;
   - relationship key validation.
3. Carry reconciliation coverage into report and visual coverage statements:
   - included and excluded datasets;
   - omitted rows;
   - per-target missing coverage;
   - explicit conflict policy;
   - no de-duplication.
4. Keep virtual datasets declarative and rowless. Their `fields` array remains the final projection: leaving a field out is the engineer's explicit `ignore` action.
5. Relationships continue to join two virtual datasets only. Reconciliation is a union/normalization concern, not a reason to introduce many-to-many or arbitrary joins.

### Verification

- A numeric custom target can use `sum`, `average`, and ratio inputs.
- A text/date/boolean custom target is rejected for invalid numeric aggregation.
- Saved reports and visuals refresh when a new compatible source is added to the targeted folder.
- A newly added source that violates a `reject` rule makes the active model fail closed with a useful reason.
- Optional missing values remain null through virtual datasets, relationships, reports, and visuals.
- Coverage totals reconcile exactly: source rows = output rows + excluded rows.

## Phase 4 — MCP and Data Model contract

### MCP

Keep the existing five mapping tools. Expand their descriptions and returned schemas; do not add a second reconciliation tool family.

- `smart_storage.virtual_model` returns candidate schemas, inferred types, null counts, and reconciliation capability metadata.
- `save_mapping_profile` accepts legacy or reconciliation definitions and always saves a draft.
- `preview_mapping_profile` returns target/dataset coverage plus bounded samples.
- `activate_mapping_profile` refuses anything other than the exact previewed, activation-ready version.
- `get_mapping_profile` identifies legacy versus reconciliation rules and exposes the declared target contract.

Connected agents may propose a contract but cannot bypass preview and explicit activation.

### Data Model Viewer requirements for the later UI/UX phase

The backend must expose enough information for these views before visual work starts:

1. **Sources** — files, sheets, row counts, detected fields, types, and review state.
2. **Target schema** — target names, types, required/optional state, and missing policy.
3. **Map** — source candidates flowing into each target; irrelevant columns visibly ignored.
4. **Preview** — included/excluded datasets, missing coverage, type failures, conflicts, and sample rows.
5. **Activate** — exact version confirmation with downstream reports/visuals affected.
6. **Lineage** — target field to source candidates and row-level source provenance; do not imply field-grain evidence that is not stored.

UI terminology should describe logical datasets and fields, not expose Supabase table names.

## Phase 5 — acceptance fixture

Create a deterministic three-dataset fixture:

```text
A: login, calls, aht_seconds, notes
B: employee_number, call_volume, avg_handle_seconds, team
C: agent_id, interactions, handle_seconds, attendance_status
```

Reconcile:

```text
agent_id <- agent_id | employee_number | login
interaction_count <- interactions | call_volume | calls
average_handle_seconds <- handle_seconds | avg_handle_seconds | aht_seconds
team <- team                    optional/null
attendance_status <- attendance_status  optional/null
```

Required acceptance evidence:

- All three dataset IDs are included.
- All source rows appear exactly once; no de-duplication is claimed.
- `notes` is ignored and does not affect compatibility.
- `team` is null outside B and coverage names its availability.
- `attendance_status` is null outside C and coverage names its availability.
- Provenance points to the correct file, dataset, sheet, and row.
- A fourth fixture with a structurally missing required target is excluded or blocks activation according to its declared policy.
- A candidate type failure and a conflicting pair are visible and do not silently pass.
- Save → preview → activate → virtual dataset → report → dashboard visual uses the same current rows and target types.
- Identical field names and slugs under a second user do not intersect with the first user's model.

Run at minimum:

```bash
npx tsx scripts/test-data-mapping-definitions.ts
npx tsx scripts/test-virtual-dataset-definitions.ts
npx tsx scripts/test-data-relationships.ts
npx tsx scripts/test-report-definitions.ts
npx tsx scripts/test-dashboard-visual-definitions.ts
npx tsc --noEmit
npm run lint
npm run build
```

Add focused fixtures for reconciliation validation, heterogeneous loading, coverage arithmetic, account isolation, and downstream custom-field typing.

Also create the selected-file/folder integration contract promised by the prior source-expansion plan; `scripts/test-report-selected-files.ts` does not currently exist. It must cover ownership intersection, compatible and incompatible datasets, files without datasets, unambiguous source naming, and unchanged legacy behavior.

## Rollout order

1. Contract and pure-engine tests; no migration required.
2. Dataset-current-state migration review and approval.
3. Heterogeneous loader behind reconciliation-profile detection.
4. Preview output and activation gate.
5. Report, dashboard, virtual-dataset, and relationship consumption.
6. MCP descriptions and capability discovery.
7. One code-level three-sheet proof.
8. One authenticated non-production proof with owned sources.
9. Production enablement.
10. Data Model Viewer UI/UX refinement using the now-stable contract.

## Anti-pattern guards

- Do not weaken direct dataset compatibility globally.
- Do not choose a random base dataset schema.
- Do not fill omitted numbers with zero.
- Do not silently convert units or change aggregation meaning.
- Do not let AI-generated mappings activate themselves.
- Do not let mappings overwrite canonical values or user corrections.
- Do not persist reconciled snapshot rows in virtual-dataset definitions.
- Do not treat a retained but disappeared sheet as current evidence.
- Do not drop provenance during projection or union.
- Do not expose arbitrary SQL, expressions, scripts, or many-to-many joins.
- Do not bind integrations to internal Supabase table layouts.

## Definition of done

A data engineer can select at least three differently shaped owned sheets, define a custom target schema, reconcile ordered aliases, explicitly handle missing columns, ignore irrelevant columns, preview every exclusion/conflict/type failure, activate the exact reviewed version, and use that stable logical dataset through MCP, reports, dashboard visuals, and safe relationships. Source data remains unchanged, provenance remains intact, users remain isolated, and existing definitions retain their current behavior.
