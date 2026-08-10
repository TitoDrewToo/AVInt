# Build Reference System

This directory is the first pass at a reusable product-build reference system.

Its purpose is not to force one workflow across unrelated products. Its purpose
is to preserve:

- standards that should stay consistent across builds
- pattern families that have multiple valid variants
- project-specific decisions that should remain local
- selection criteria so future projects can choose the right method for the
  intended use case

## Current Inspection Basis

This reference set is based only on code and docs that were actually inspected:

- `avint/`
- `smart-security/`

The following were intentionally excluded from code-derived conclusions because
no inspectable local source tree was available in this workspace:

- `PicklePal`
- `Hooper`

Those projects may still be added later if their real source trees are made
available. For now, they should not be used to justify standards or patterns in
this system.

## How To Use This Reference

When starting a new product or a new major subsystem, decide each topic using
three buckets:

1. `Standardized`
   - should remain mostly consistent across builds
2. `Pattern Family`
   - reusable concept with multiple valid variants
3. `Project-Specific`
   - should stay local to the product and not be generalized too early

Use these docs in this order:

1. [inspection-scope.md](./inspection-scope.md)
2. [reference-architecture.md](./reference-architecture.md)
3. [standardization-matrix.md](./standardization-matrix.md)
4. [pattern-families.md](./pattern-families.md)

## Decision Rule

Do not ask "what is the best pattern overall?"

Ask:

- what problem is being solved
- what constraints exist
- what trust boundaries exist
- what user journey is intended
- what parts should be reused
- what parts should remain product-specific

That is the core rule for repeatable builds without flattening domain-specific
products into one generic workflow.
