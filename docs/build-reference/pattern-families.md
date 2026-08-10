# Pattern Families

This document captures the most reusable pattern families proven by the current
inspected codebases.

## 1. Entitlement and Pricing Pattern

### Proven Shape

AVIntelligence uses a single entitlement model to normalize:

- free access
- day pass
- gift code
- recurring Pro

The important reusable idea is not the specific plans. It is the pattern:

- one shared entitlement computation layer
- one translation layer from raw subscription row to UI/business meaning
- one source of truth for active vs inactive vs unlimited logic

### Reusable Principle

If multiple product states map to access control, collapse them into a common
entitlement abstraction before the UI and route logic consume them.

### What To Standardize

- entitlement derivation as a shared module
- active/inactive expiration handling
- safe client/server boundary for access logic

### What To Keep Local

- plan names
- billing cadence
- commercial packaging

## 2. File-Ingestion Gate Pattern

### Proven Shape

AVIntelligence currently uses:

1. download file
2. size validation
3. magic-byte validation
4. extension and declared MIME reconciliation
5. structural checks
6. duplicate quarantined hash check
7. Smart Security scan
8. AI safety pass
9. approve and move to canonical path
10. trigger deeper processing

### Reusable Principle

High-risk ingest flows should gate expensive or sensitive downstream work behind
cheap deterministic checks first, then specialized scanning, then higher-cost
AI checks.

### What To Standardize

- cheap deterministic checks first
- quarantine path for rejects
- approved path moves into canonical storage
- downstream processing only after approval

### What To Keep Local

- file types
- domain-specific accept/reject policy
- downstream processing stages

## 3. Separate Security Service Pattern

### Proven Shape

Smart Security is intentionally separate from AVIntelligence.

It handles:

- file scan decisions
- request decisioning
- security event recording

### Reusable Principle

If security logic is becoming a product capability or a shared defense layer,
separate it from the main application so it can evolve independently.

### What To Standardize

- app identifies itself to the security service
- signed URLs preferred over broad storage access
- events and decisions recorded with sanitized metadata
- observe mode before enforcement mode

### What To Keep Local

- decision thresholds
- app-specific protected routes
- app-specific risk signals

## 4. Observe-Then-Enforce Rollout Pattern

### Proven Shape

Both AVIntelligence and Smart Security reflect a staged rollout idea:

- collect decisions first
- observe real traffic
- enforce later once confidence is adequate

### Reusable Principle

Do not enable fail-closed security enforcement without evidence from production
behavior first, unless the risk profile absolutely requires it.

### What To Standardize

- mode flag
- telemetry capture
- explicit block/rate-limit/challenge outputs

### What To Keep Local

- exact thresholds
- exact rollout timing

## 5. Delete-Account Safety Pattern

### Proven Shape

AVIntelligence delete-account flow prioritizes:

1. verified requester identity
2. rate limiting
3. atomic database deletion through RPC
4. best-effort storage cleanup
5. final auth-user deletion

### Reusable Principle

For destructive account removal, make primary data consistency atomic first.
Treat storage/object cleanup as best effort where possible.

### What To Standardize

- verified ownership
- rate limiting
- transactional DB deletion
- idempotent retry tolerance

### What To Keep Local

- exact table set
- object-store layout
- retention and anonymization rules

## 6. AI-As-Interpreter, Not Calculator Pattern

### Proven Shape

Across AVIntelligence, AI is used for:

- extraction
- classification
- enrichment
- contextual summary
- advanced analytics narrative

But the system intentionally keeps deterministic calculations and core report
logic outside the model where correctness matters.

### Reusable Principle

Use AI to interpret, extract, summarize, and propose. Keep correctness-critical
math and irreversible business logic deterministic.

### What To Standardize

- model outputs feed structured records
- downstream deterministic systems own final totals and business rules
- product should disclose AI-generated outputs appropriately

### What To Keep Local

- prompts
- domain-specific schemas
- acceptable confidence thresholds

## Recommended Next Docs

The next three docs to add should be:

1. `standards/security-baseline.md`
2. `patterns/auth-flows.md`
3. `patterns/data-ingestion.md`
