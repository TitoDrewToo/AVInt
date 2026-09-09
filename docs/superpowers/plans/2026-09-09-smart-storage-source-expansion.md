# Smart Storage Source Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand saved reports and dashboard visuals from folder or single-dataset sources to intentional file selections, reusable virtual datasets, reusable mappings, and safe declared relationships.

**Architecture:** Preserve the existing declarative report contract and shared report/dashboard loader. Ship the expansion as four independently testable increments: file selection in definition JSON; persisted virtual datasets; persisted canonical mappings; and constrained equality relationships. Every source is resolved server-side against the authenticated user, and definitions never contain SQL, executable expressions, or caller-supplied URLs.

**Tech Stack:** Next.js 16, TypeScript, Supabase/PostgreSQL, MCP tools, React PDF, Node assertion scripts.

---

## Scope and order

1. Selected-file targeting requires no migration and ships first.
2. Saved virtual datasets require a reviewed additive schema and separate approval before migration work.
3. Mapping profiles require a reviewed additive schema and a mapping preview before activation.
4. Relationships require explicit keys and cardinality; arbitrary joins and executable expressions remain prohibited.

### Task 1: Add selected-file source contracts

**Files:**
- Modify: `lib/report-definitions.ts`
- Test: `scripts/test-report-definitions.ts`

- [ ] **Step 1: Add failing validation assertions**

Assert that record sources accept one to 100 unique UUID file IDs, and dataset sources accept exactly one selector among `datasetId`, `folderId`, and `fileIds`. Assert that empty, duplicate, malformed, and oversized selections fail.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `npx tsx scripts/test-report-definitions.ts`

Expected: the selected-file cases fail before the source union is extended.

- [ ] **Step 3: Extend the declarative source union**

Use these shapes:

```ts
type ReportDefinitionSource =
  | { kind: "records"; documentTypes?: string[]; fileIds?: string[] }
  | { kind: "dataset"; datasetId?: string; folderId?: string; fileIds?: string[]; dateField?: string; currencyField?: string }
```

Normalize UUIDs to lowercase, reject duplicates, cap the list at 100, and retain the existing field-name validation. Dataset definitions must contain exactly one selector.

- [ ] **Step 4: Run the contract test**

Run: `npx tsx scripts/test-report-definitions.ts`

Expected: all existing and selected-file assertions pass.

### Task 2: Enforce ownership when definitions are saved

**Files:**
- Modify: `lib/report-definition-store.ts`
- Test: `scripts/test-report-selected-files.ts`

- [ ] **Step 1: Test exact ownership resolution**

Use a stub query client containing two owned file IDs and one foreign file ID. Assert that all-owned selections resolve, while missing or foreign IDs produce `Selected files do not exist or are not accessible` without disclosing which account owns them.

- [ ] **Step 2: Implement one ownership helper**

Create a helper that selects `id, filename, folder_id` from `files`, constrained by both `user_id` and the requested IDs. Compare the unique returned ID set with the requested ID set. Do not trust an ID merely because it is syntactically valid.

- [ ] **Step 3: Apply it to both source kinds**

For record sources, selected files narrow the canonical-record source. For dataset sources, selected files determine the candidate datasets. If a selected file has no dataset, saving remains allowed only when at least one selected file has a dataset; runtime coverage names files without datasets.

- [ ] **Step 4: Run the selected-file test**

Run: `npx tsx scripts/test-report-selected-files.ts`

Expected: ownership, non-disclosure, and mixed dataset/no-dataset cases pass.

### Task 3: Load records and compatible datasets from selected files

**Files:**
- Modify: `lib/report-definition-engine.ts`
- Test: `scripts/test-report-selected-files.ts`

- [ ] **Step 1: Test record-source intersection**

Assert that `fileIds`, folder scope, and `documentTypes` intersect rather than broaden one another. An empty intersection returns an honest empty source.

- [ ] **Step 2: Implement record selection**

Resolve owned folder/document-type file IDs as today, then intersect them with `source.fileIds` before querying records. Never query records using caller IDs without the authenticated-user predicate.

- [ ] **Step 3: Test dataset compatibility and coverage**

Provide two selected compatible files, one schema-incompatible file, and one file with no dataset. Assert that compatible rows are unioned without de-duplication and that both exclusions are named with their reasons.

- [ ] **Step 4: Implement selected-file dataset loading**

Query candidate datasets by authenticated user and selected file IDs. Reuse exact `(key, data_type)` compatibility. Attach `__dataset_id`, `__dataset_name`, and `__file_id` to every row. Coverage must state compatible dataset count, no de-duplication, schema mismatches, and selected files with no dataset.

- [ ] **Step 5: Run report tests**

Run:

```bash
npx tsx scripts/test-report-definitions.ts
npx tsx scripts/test-report-engine-advanced.ts
npx tsx scripts/test-report-selected-files.ts
```

Expected: all pass; existing folder and dataset definitions are unchanged.

### Task 4: Expose the source capability to connected agents

**Files:**
- Modify: `app/api/mcp/[[...transport]]/route.ts`
- Modify: `lib/virtual-model.ts`
- Test: `scripts/test-report-selected-files.ts`

- [ ] **Step 1: Add source-capability metadata**

Return a compact `sourceCapabilities` object from `smart_storage.virtual_model` describing `records`, `dataset`, supported selectors, combination semantics, row limits, and the requirement to use returned owned IDs.

- [ ] **Step 2: Update MCP authoring descriptions**

Tell connected agents that `fileIds` is an intentional evidence boundary, folder selectors include descendants, selected datasets require compatible schemas, and incompatible sources are disclosed rather than coerced.

- [ ] **Step 3: Verify dashboard inheritance**

Because `DashboardVisualDefinition` validates through `validateReportDefinitionPayload` and loads through `loadReportDefinitionSource`, assert that a selected-file visual validates without a second source implementation.

- [ ] **Step 4: Run static checks**

Run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all pass with no new warnings.

### Task 5: Add saved virtual datasets (separate schema approval)

**Files:**
- Create after approval: `supabase/migrations/<timestamp>_add_virtual_dataset_definitions.sql`
- Create: `lib/virtual-dataset-definitions.ts`
- Create: `lib/virtual-dataset-store.ts`
- Modify: `lib/report-definitions.ts`
- Modify: `lib/report-definition-engine.ts`
- Modify: `app/api/mcp/[[...transport]]/route.ts`
- Test: `scripts/test-virtual-dataset-definitions.ts`

- [ ] **Step 1: Approve the additive persistence contract**

Store `user_id`, stable `slug`, title, declarative source, filters, projected fields, version, authorship, timestamps, and archive state. Apply owner RLS and explicit function grants. Do not store rows or SQL.

- [ ] **Step 2: Add validation and optimistic versioning**

Reuse report field/filter validators and report-definition conflict behavior. Reject cyclic virtual-dataset references and cap nesting at one level for the first release.

- [ ] **Step 3: Add MCP list/save/resolve tools**

Return coverage and compatibility before a virtual dataset is accepted. Reports and visuals reference its stable slug and resolve it at run time.

- [ ] **Step 4: Prove refreshability**

Save one virtual dataset, add a compatible source file, rerun its report, and show the new rows without changing either saved definition.

### Task 6: Add reusable mapping profiles (separate schema approval)

**Implemented direction (9 Sep):** Mapping profiles are a post-ingestion source layer. They bind an owned records/dataset source to validated field mappings, require preview of the exact version before activation, and resolve at report/dashboard runtime. They do not rewrite extraction, normalization, canonical records, or source evidence. Existing canonical values and user corrections remain authoritative.

**Files:**
- Create after approval: `supabase/migrations/<timestamp>_add_data_mapping_profiles.sql`
- Create: `lib/data-mapping-definitions.ts`
- Create: `lib/data-mapping-store.ts`
- Modify: `lib/virtual-model.ts`
- Modify: shared report/dashboard source resolution after preview approval
- Test: `scripts/test-data-mapping-definitions.ts`

- [x] **Step 1: Approve a declarative mapping contract**

Map owned source field keys to known canonical keys with optional safe coercions from an allowlist. Prohibit expressions, network calls, scripts, and cross-user references.

- [x] **Step 2: Build preview before activation**

Preview affected files, sample before/after values, conflicts, null creation, and type failures. Activation requires an explicit version and records the actor.

- [x] **Step 3: Expose mappings in the Data Model and MCP discovery**

Show mapped, unmapped, conflicting, and deprecated source fields. Agents may propose mappings, but activation remains an explicit account action.

- [x] **Step 4: Prove correction survival**

Resolve a mapped fixture and show that existing canonical and user-corrected values remain authoritative over mapped values. Invalid coercions fail closed and appear in preview/coverage rather than rewriting the source.

### Task 7: Add constrained relationships (separate schema approval)

**Files:**
- Create after approval: `supabase/migrations/<timestamp>_add_virtual_dataset_relationships.sql`
- Create: `lib/data-relationship-definitions.ts`
- Create: `lib/data-relationship-engine.ts`
- Modify: `lib/virtual-model.ts`
- Modify: `lib/report-definition-engine.ts`
- Test: `scripts/test-data-relationships.ts`

- [ ] **Step 1: Approve the relationship contract**

Allow equality relationships only between named fields of owned virtual datasets. Require declared `one_to_one`, `one_to_many`, or `many_to_one` cardinality. Prohibit `many_to_many` in the first release.

- [ ] **Step 2: Validate cardinality and estimate expansion**

Before saving, report unmatched keys, duplicate keys on the required-unique side, null keys, and projected output rows. Refuse a violated cardinality or output beyond the source-row cap.

- [ ] **Step 3: Preserve provenance**

Every joined row retains both source dataset/file identities. Coverage states match rate, unmatched rows, excluded sources, and relationship version.

- [ ] **Step 4: Prove that missing data is not converted into zero**

Run fixtures with unmatched and incomplete periods. Comparisons must become unavailable where the joined evidence does not cover both windows.

## Closure criteria

- Existing definitions render unchanged.
- Selected-file reports and visuals resolve only files owned by the authenticated user.
- Folder, file, document-type, and period constraints intersect.
- Incompatible or absent datasets are named, never silently coerced.
- Virtual datasets and mappings store reusable declarations, not generated snapshots.
- Relationships are equality-only, cardinality-checked, bounded, and provenance-preserving.
- MCP discovery explains what can and cannot be safely combined.
- No feature accepts SQL, formulas, executable expressions, arbitrary URLs, or cross-account identifiers.
