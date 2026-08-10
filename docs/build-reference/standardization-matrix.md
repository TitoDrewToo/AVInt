# Standardization Matrix

This matrix captures what should be standardized across builds, what should be
treated as a pattern family, and what should remain product-specific.

## Standardized

These should become common baseline rules across projects.

### Security and Trust Boundaries

- sensitive mutations must verify requester identity and ownership
- secrets and service-role credentials must stay server-side
- sensitive routes should support rate limiting
- request perimeter checks should exist for high-risk app/API surfaces
- uploads should be validated before deeper processing
- deletion flows should prioritize database consistency before best-effort
  storage cleanup
- public docs should describe security posture without exposing attack roadmap

### Engineering Hygiene

- environment variable naming should be explicit and scoped
- pure client-safe logic should be isolated from server-only modules when trust
  boundaries matter
- rollout flags should exist for systems that can break live traffic if enabled
  too early
- logs and API errors should be sanitized
- migrations should carry the source of truth for security-sensitive schema

### Product Baselines

- pricing must be clear and low-ambiguity
- entitlement state must be derived from one shared source of truth
- account controls should reflect actual subscription state cleanly
- empty states and locked states should be explicit rather than confusing

## Pattern Families

These should be reusable, but not forced into one universal variant.

### Auth Flows

Possible variants:

- email/password
- Google SSO
- signup-first paid access
- free-first then upgrade
- challenge/redirect when risk conditions are met

Standardize:

- security expectations
- return-path handling
- session integrity

Do not standardize:

- exact onboarding order
- exact CTA sequence

### Data Ingestion

Possible variants:

- file-upload-first
- form-first
- event-first
- mixed ingestion

AVIntelligence currently proves:

- upload -> prescan -> quarantine or approve -> process -> normalize

That should be treated as one strong pattern family member, not the only valid
ingestion model for future products.

### AI Processing Pipelines

Possible variants:

- extraction pipeline
- enrichment pipeline
- narrative summary pipeline
- advanced analytics generation
- defensive classification and screening

Standardize:

- provider boundaries
- prompt versioning discipline
- fallback and failure posture
- deterministic math stays outside the model where correctness matters

Do not standardize:

- product-specific schema
- product-specific KPI semantics

### Analytics and Dashboards

Possible variants:

- deterministic KPI dashboards
- AI-assisted contextual dashboards
- exploratory advanced analytics
- operational dashboards

Standardize:

- data provenance
- explicit labeling of converted or derived values
- clear separation between deterministic calculations and narrative overlays

Do not standardize:

- exact widgets
- exact business metrics

## Project-Specific

These should stay local unless multiple projects prove the same shape.

- tax-bundle logic
- contract/key-terms logic
- document classification categories tied to AVInt
- domain-specific income/expense semantics
- product-specific growth funnels
- app-specific user journeys

## Immediate Standardization Priorities

If building the next reference docs, start with:

1. security baseline
2. deployment and secrets handling
3. auth and entitlement patterns
4. data-ingestion patterns
5. AI processing pipeline rules
