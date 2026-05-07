# Smart Security

Defensive security subsystem for AVIntelligence, deployed as a separate service. In-repo source tree for year-1 convenience; extraction to a separate repo is a year-2 option.

**Architecture reference**: `docs/smart-security-architecture.md`
**Current phase spec**: `docs/smart-security-phase-0.md`

## Relationship to deployed services

This folder is the **doctrine + policy + schema source of truth** for Smart Security. The runtime services live elsewhere:

- **Scanner service** (TypeScript / Cloud Run, deployed): `github.com/TitoDrewToo/smart-security` — ClamAV + structural scanners + wire endpoints. Already in production at `asia-southeast1`, AVIntelligence is observe-mode tenant zero.
- **LLM inference service** (Python + vLLM / Cloud Run, planned): `smart-security-llm` — Gemma 4 E4B → fine-tuned E4B → 26B A4B. Phase 0.5 stands this up.

Both services consume the contents of this folder (action matrix, schemas, SKILL contract, detection registry) via release-pinned snapshots in their container builds. Edits here flow downstream at the next service release.

## Wired integration points (frozen in phases 0-3)

- `POST /v1/scan/file` — called by `supabase/functions/prescan-document/index.ts`
- `POST /v1/decide` — called by `proxy.ts`
- `POST /v1/events` — telemetry endpoint on the deployed scanner service; not yet called from AVIntelligence.

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

- **Phase 0 (foundations + schemas)**: complete.
- **Phase 0.5 (E2E LLM pipeline on free tier with base Gemma 4 E4B)**: pending — see `docs/smart-security-phase-0.5.md` (when written) and `docs/smart-security-architecture.md`.
- **Phase 1 (evidence spine + first fine-tuned E4B)**: pending.

Strategic direction (durable reference): `docs/smart-security-architecture.md`. Updated 2026-05-07 with the own-model + two-service topology + compliance-first + avintph.com unified-portal commerce model.
