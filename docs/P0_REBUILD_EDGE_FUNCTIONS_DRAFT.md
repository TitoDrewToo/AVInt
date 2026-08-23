# P0 Rebuild Draft — Edge Functions and Processing Pipeline

> STATUS (2026-08-23): Superseded. Smart Storage was decommissioned
> as a product and is now an internal tool. This document is retained
> as the reasoning record for the universal-workflow direction, not
> as an active specification.

**Status:** Architecture draft; no code changes implied.

## 1. Principle

Preserve the Smart Storage processing boundary and security posture, but separate generic pipeline stages from domain-specific interpretation.

```text
prescan-source
  → extract-source
  → materialize-records
  → normalize-records
  → validate-and-reconcile
  → settle-ingestion-run
  → run-output
```

Existing functions can be wrapped or incrementally generalized. A wholesale replacement is unnecessary.

## 2. Function responsibilities

### `prescan-document` → generalized source prescan

Retain:

- authentication and service-role boundary;
- ownership/workspace authorization;
- magic-byte and MIME validation;
- Smart Security screening;
- quarantine behavior;
- checksum generation;
- inbox-to-canonical movement.

Add or formalize:

- `source_object_id`;
- ingestion-run association;
- atomic processing claim;
- source checksum and source version;
- explicit terminal/retry status;
- preservation of the original source reference.

### `process-document` → `extract-source`

This function should answer: “What observations can be extracted from this source?”

It should not decide whether a field is tax-relevant, workforce-relevant, or executive-relevant. It should produce a typed extraction envelope containing:

- source object and ingestion item identifiers;
- extraction provider and version;
- candidate rows/observations;
- field names and raw values;
- confidence;
- page, cell, region, or source-location evidence where available;
- extraction warnings;
- raw provider response retained under controlled storage.

Spreadsheet extraction remains deterministic. Document extraction may use providers, but provider output must pass a schema boundary before persistence.

### `normalize-document` → `materialize-records`

Normalization should apply the selected profile schema and mappings to extraction observations. It should create a new record version rather than overwrite the previous version.

It must support:

- profile and schema-version selection;
- typed field coercion;
- required-field checks;
- source-priority rules;
- deterministic normalization;
- provider-assisted interpretation only where allowed;
- low-confidence and unresolved states;
- correction history;
- idempotent retries.

Tax normalization becomes a profile adapter using the same function contract.

### New `validate-and-reconcile`

This stage evaluates records against profile rules and source expectations:

- missing required fields;
- duplicate identity keys;
- unexpected additions/removals;
- source count mismatches;
- stale sources;
- conflicting authoritative values;
- schema drift;
- low-confidence fields.

It should produce durable reconciliation results rather than only logs.

### New `run-output`

This stage executes an approved output template against a profile query context. It owns:

- scope resolution;
- deterministic calculations;
- output rendering;
- artifact creation;
- evidence references;
- approval state;
- run history;
- webhook/status updates.

Claude may help author or explain an output specification, but the execution contract must be validated and controlled by AVIntelligence.

## 3. Run lifecycle

Every asynchronous flow should have an explicit run and item model:

```text
created → claimed → processing → partially_complete → complete
                                      ↘ failed / needs_review
```

The file status should not be the only lifecycle authority. A file may be extracted while its ingestion run remains unresolved because records still need normalization, validation, or reconciliation.

## 4. Required idempotency keys

At minimum:

- source connection + source object ID + source version;
- source checksum for file backfills;
- ingestion run item;
- profile ID + schema version + source observation;
- workflow template + input scope + run request ID.

Concurrent invocations must claim work atomically before provider calls.

## 5. Tax compatibility

The tax adapter may continue to call current code paths during the transition. The adapter must preserve:

- verified tax calculations;
- Schedule C behavior;
- accounting export rules;
- evidence ZIP behavior;
- existing report and deletion tests.
