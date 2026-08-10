# Inspection Scope

## Goal

Build a reusable cross-project reference system from actual shipped code and
real architectural decisions, while avoiding false generalization from incomplete
or unavailable projects.

## Included Sources

### AVIntelligence

Inspected areas included:

- product README and public capability docs
- request perimeter middleware via `proxy.ts`
- entitlement and pricing status logic
- upload prescan and quarantine flow
- delete-account route
- pricing structure and plan definitions

### Smart Security

Inspected areas included:

- service README
- file scan request validation and decisioning
- request decision engine
- event recording design

## Explicit Exclusions

### PicklePal

Not included in code-derived conclusions.

Reason:

- local folder contains only image assets
- no inspectable source tree or git working copy was available

### Hooper

Not included in code-derived conclusions.

Reason:

- local folder exists but contains no code
- no inspectable source tree or git working copy was available

## Important Constraint

This reference system is not a cleanup or rewrite plan for on-hold products.

If an on-hold product later shows inefficiencies, those should not be turned
into immediate action items here unless:

- the pattern materially affects current shared standards, or
- the source is present and the issue is proven by inspection

For now, unavailable or unfinished projects are treated as out of scope, not as
evidence.

## What This Means

This first pass should be read as:

- proven patterns from AVIntelligence
- proven defensive patterns from Smart Security
- a structure for future additions when PicklePal and Hooper source becomes
  available
