# Smart Security

Defensive security subsystem for AVIntelligence, deployed as a separate service. In-repo source tree for year-1 convenience; extraction to a separate repo is a year-2 option.

**Architecture reference**: `docs/smart-security-architecture.md`
**Current phase spec**: `docs/smart-security-phase-0.md`

## Wired integration points (frozen in phases 0-3)

- `POST /v1/scan/file` — called by `supabase/functions/prescan-document/index.ts`
- `POST /v1/decide` — called by `proxy.ts`

See `schemas/wire-scan-file.schema.json` and `schemas/wire-decide.schema.json` for the contracts.

## Structure

- `SKILL.md` — operational contract for agents.
- `config/tenant.ts` — tenant configuration (year 1: single tenant).
- `policies/` — action matrix, risk tiers, evidence policy.
- `detections/` — rule registry and rule implementations.
- `knowledge/` — doctrine manifest and framework mappings.
- `schemas/` — JSON Schemas: four internal (decision, incident, evidence, detection) and two wire (scan-file, decide).
- `services/` — container services (analyzer, responder, ingestor).
- `memory/` — runtime data location (not committed to git).

## How to contribute a detection

1. Add an entry to `detections/registry.json` with `mode: observe`.
2. Add the rule file at the `rule_path` you specified.
3. Add a test corpus under `detections/corpora/<detection_id>/` with at least one known-good and one known-bad file.
4. Add an entry to `knowledge/mappings/rule-to-attack.json`.
5. Do not set `mode: enforce` without the promotion criteria met (see the entry's `promotion_criteria`).

## Current status

Phase 0 complete. Phase 1 (evidence spine) pending.
