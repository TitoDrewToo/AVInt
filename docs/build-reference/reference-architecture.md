# Reference Architecture

## Purpose

The reference system should help future projects inherit the right knowledge
without forcing unrelated products into the same workflow.

## Top-Level Model

The system should be organized into four layers:

### 1. Standards

Use for things that should stay mostly consistent across builds.

Examples:

- secret handling
- server/client boundary discipline
- auth verification for sensitive mutations
- delete-account safety expectations
- public security wording rules
- rollout toggles and fail-open vs fail-closed posture
- rate-limit baseline for sensitive routes

### 2. Pattern Families

Use for reusable concepts that have multiple valid variants.

Examples:

- auth flow patterns
- onboarding patterns
- subscription and entitlement patterns
- data-ingestion patterns
- AI processing pipelines
- dashboard and analytics patterns
- defensive security patterns

The system should record not only the pattern, but when to use each variant.

### 3. Project-Specific Notes

Use for domain-local logic that should not be generalized too early.

Examples:

- tax-bundle logic
- contract summary logic
- domain-specific KPIs
- domain-specific reporting semantics

### 4. Decision Records

Use for durable reasons behind key implementation choices.

Examples:

- why entitlement logic was split into a pure client/server-safe module
- why Smart Security is a separate service
- why prescan quarantines before deeper AI processing
- why observe-mode rollout exists before enforce-mode blocking

## Selection Model

Every future build should classify each major concern as one of:

- `Standardized`
- `Pattern Family`
- `Project-Specific`

This avoids two common failures:

1. over-standardizing product-specific workflows
2. re-solving solved infrastructure and security problems from scratch

## Recommended Future Folder Shape

```text
docs/build-reference/
  README.md
  inspection-scope.md
  reference-architecture.md
  standardization-matrix.md
  pattern-families.md
  project-notes/
    avintelligence.md
    smart-security.md
    picklepal.md
    hooper.md
  standards/
    security-baseline.md
    deployment-and-secrets.md
    error-handling-and-logging.md
  patterns/
    auth-flows.md
    entitlements-and-pricing.md
    data-ingestion.md
    ai-processing-pipelines.md
    dashboards-and-analytics.md
```

Only add `picklepal.md` and `hooper.md` as code-backed project notes once their
actual source trees are available.
