# Smart Security — Architecture Reference

Durable reference for the Smart Security subsystem. Read this before reviewing or extending any `smart-security/` work. Phase-specific implementation specs live in `docs/smart-security-phase-N.md`.

## Purpose

A defensive security layer built as a separate service from AVIntelligence, with AVIntelligence as its first and (in year 1) only customer. Year 2+ optionally opens the same service to external tenants.

Design goals:

1. Prevent or contain attacks at the boundary — not comment on them afterward.
2. Produce a durable, cited decision record for every action taken.
3. Learn continuously from incidents (internal loop) and public frameworks (external loop).
4. Stay reversible in the autonomous envelope; never delete customer data autonomously.
5. Be architected from day 0 for multi-tenant extraction, even while running single-tenant.

Non-goals:

- Endpoint security (laptops/servers) — out of category.
- Network-layer DDoS — handled by Cloudflare.
- Offensive hack-back — legally prohibited and explicitly excluded.
- General-purpose SIEM — adjacent space; not our focus.

## Existing baseline (as of phase 0 start)

Smart Security was scoped earlier in the project as a separate service. Two AVIntelligence integration points already call into it, both in observe mode. **Neither is to be modified in phases 0-3.** The wire contracts below are frozen at the boundary; Smart Security phase work builds the logic *behind* them.

| Layer | Caller in AVI repo | Endpoint on Smart Security service | Response vocabulary | Observe/enforce toggle |
|---|---|---|---|---|
| Ingress (file) | `supabase/functions/prescan-document/index.ts:407` | `POST /v1/scan/file` | `clean / suspicious / infected / scan_error` | `SMART_SECURITY_REQUIRED` |
| Session (request) | `proxy.ts:38` | `POST /v1/decide` | `allow / block / rate_limit / challenge` | `SMART_SECURITY_MIDDLEWARE_MODE` |

**`POST /v1/scan/file`** request body (sent by prescan-document):

```json
{
  "app_id": "avintelligence",
  "file_id": "...",
  "storage_path": "...",
  "signed_url": "...",
  "mime_type": "...",
  "filename": "..."
}
```

Response shape consumed by prescan-document:

```json
{
  "decision": "clean | suspicious | infected | scan_error",
  "signals": ["..."],
  "scanner": { "clamav": { "signature": "..." } }
}
```

**`POST /v1/decide`** request body (sent by proxy.ts):

```json
{
  "app_id": "avintelligence",
  "source": "vercel_middleware",
  "ip": "...",
  "method": "GET",
  "path": "...",
  "user_agent": "...",
  "accept_language": "...",
  "country": "...",
  "metadata": { "host": "...", "referer": "..." }
}
```

Response shape consumed by proxy.ts:

```json
{ "decision": "allow | block | rate_limit | challenge" }
```

Headers on both: `Content-Type: application/json`, `x-smart-security-key: <SMART_SECURITY_API_KEY>`.

Protected prefixes already declared in `proxy.ts:7` (the Layer-2 inspection surface):

- `/api/chat`
- `/api/redeem-gift`
- `/api/reports`
- `/api/creem/checkout`, `/api/creem/cancel`
- `/api/delete-account`, `/api/delete-file`
- `/api/obligations`
- `/tools`

Environment variables already declared:

- `SMART_SECURITY_URL` — base URL for the Smart Security service.
- `SMART_SECURITY_API_KEY` — shared key sent in `x-smart-security-key`.
- `SMART_SECURITY_REQUIRED` — when `true`, prescan fails closed on scan errors.
- `SMART_SECURITY_MIDDLEWARE_MODE` — when `enforce`, proxy honors decisions; otherwise decisions are observed via response headers only.

`docs/build-reference/reference-architecture.md:60` establishes the intent: *"Smart Security is a separate service"* with *"observe-mode rollout... before enforce-mode blocking"*. This repository's `smart-security/` directory is the source tree for that separate service.

**What this means for the Smart Security build**:

- The `smart-security/` directory is the source for the separate service; year-1 deploy target is Google Cloud Run.
- Wire contracts (`/v1/scan/file`, `/v1/decide`) are frozen for phases 0-3. The AVIntelligence side is not modified during these phases. Any future wire change requires coordinated edits to both sides in a single commit.
- The Smart Security *internal* action vocabulary (the `action` enum in `schemas/decision.schema.json`) is richer than the *external* wire vocabulary. A translation layer at the API handler maps internal decisions to the wire response shape.
- Phase 1 (evidence spine) adds decision logging *inside the Smart Security service* for every call to both endpoints, without changing the wire.

## Framing principles

| Principle | Meaning |
|---|---|
| Internal-first | AVIntelligence is the sole tenant in year 1 (`tenant_id = "avint"`). |
| Multi-tenant-ready | Every schema carries `tenant_id` from day 0; year-2 extraction is a flag flip, not a migration. |
| Prevention-first | Defensive action happens at the ingress/session/egress boundary, not after damage. |
| Evidence-first | No action commits until a decision record persists. |
| Doctrine-cited | Every classification references at least one public security framework. |
| Reversible-only (year 1) | No autonomous irreversible actions. Ever. |
| Deterministic orchestration | The orchestrator is code, not an LLM. LLMs fill roles the orchestrator invokes. |
| No hack-back | Bounded to containment, deception, and forensic capture. |
| Wire stability | The boundary API to AVIntelligence is conservative. Internal evolution does not leak as breaking wire changes. |

## Threat model

Primary threats defended against:

1. **Malicious document uploads** — malware-laden PDFs, macro-embedded Office files, polyglot files, archive bombs.
2. **Account takeover** — credential stuffing, session hijacking, session fixation, impossible-travel patterns.
3. **Data exfiltration via abnormal egress** — compromised edge functions making outbound calls to unusual destinations.
4. **LLM/agentic attacks on document processing** — prompt injection in scanned documents, OCR poisoning, prompt-in-metadata.
5. **Cross-tenant attacks** (year 2+) — hash reputation, attacker reuse of infrastructure across tenants.

Explicitly out of scope for v1:

- Network-layer DDoS (Cloudflare's job).
- Endpoint compromise on user machines we don't control.
- Supply-chain attacks on third-party dependencies (tracked separately; not Smart Security's mandate).

## System layers

### Layer 1 — Ingress boundary (wired, observe mode)

AVIntelligence uploads pass through `supabase/functions/prescan-document`, which calls `POST ${SMART_SECURITY_URL}/v1/scan/file` with a signed URL. The Smart Security service is expected to fetch the bytes, run the analyzer pipeline, and return a wire-vocabulary decision.

Wire response values (preserved through all phases):

- `clean` — ingested normally.
- `suspicious` — prescan rejects in enforce mode; allows with watch in observe mode.
- `infected` — prescan rejects.
- `scan_error` — prescan allows in observe mode; rejects when `SMART_SECURITY_REQUIRED=true`.

Smart Security's internal decision (`allow / allow_with_watch / quarantine / reject / ...`) is richer; the API handler translates to the wire response shape. See the translation table in `schemas/decision.schema.json` description and the API handler in `services/api/` (phase 2+).

### Layer 2 — Session boundary (wired, observe mode)

`proxy.ts` calls `POST ${SMART_SECURITY_URL}/v1/decide` for every request whose path matches `PROTECTED_PREFIXES`. The Smart Security service is expected to evaluate the request against rolling per-principal baselines and return a wire decision.

Wire response values:

- `allow` — proxy passes through.
- `block` — proxy returns 403.
- `rate_limit` — proxy returns 429.
- `challenge` — proxy redirects to `/auth/process?action=login&next=<original path>`.

The wiring exists today. Phase 4 introduces the actual anomaly-scoring intelligence behind this endpoint: rolling baselines, behavioral detections, model-assisted classification. Phase-0 Smart Security does not serve intelligent decisions at `/v1/decide` yet; the current service deployment can legitimately return `allow` for everything until phase 4 lands.

### Layer 3 — Egress boundary (not yet wired)

Edge function outbound traffic monitoring. Domain allowlists per function, anomaly scoring on destinations, outbound request logging. Phase 6+; requires new integration points in AVIntelligence that do not yet exist.

## Agent roles

| Role | Function | Primary model | Fallback chain | Phase introduced |
|---|---|---|---|---|
| Triage Agent | Read-only classification of detection events; cites doctrine. | Claude Haiku 4.5 | GPT-5 mini → Gemini Flash | 3 |
| Responder Agent | Selects action from matrix; writes human-readable justification. | Claude Sonnet 4.6 | GPT-5 → Gemini 2.5 Pro | 4 |
| Investigator Agent | Post-incident timeline + review + postmortem. | Claude Opus 4.7 (extended thinking) | Sonnet 4.6 | 4 |
| Doctrine Agent | Ingests public frameworks, proposes rule updates. | Gemini 2.5 Pro (batch) | Sonnet 4.6 | 3 |
| Orchestrator | Routes events, enforces action matrix, holds kill-switch, emits audit trail. | Deterministic TypeScript state machine — not an LLM. | — | 1 |
| Analyzer | YARA-X + qpdf + pdfid + olevba + clamav, pinned container. | Deterministic binaries. | — | 2 |

Every LLM invocation records the exact model and version in the decision record. This is the regression-detection mechanism when providers ship new versions.

## Autonomy boundary

Encoded in `smart-security/policies/action-matrix.yaml`, not in model prompts. The matrix is reviewable in diffs; prompts drift.

**Autonomous envelope, year 1 (all reversible)**:

- Quarantine a file (move bytes to evidence bucket; mark row `status='quarantined'`).
- Revoke a session / rotate a short-lived token.
- Rate-limit a principal for ≤1 hour.
- Block an upload at ingress before it lands in storage.
- Freeze a storage path (write-block; not a delete).

**Never autonomous, ever**:

- Delete customer data.
- Cross-tenant action (year-2 policy still forbids).
- Prolonged lockout (>1h) of a paying principal.
- Customer-visible communication (notifications, emails, webhooks to third parties).

## Phase plan

| Phase | Scope | Exit signal | Status |
|---|---|---|---|
| 0 | Foundations: folder skeleton, schemas (internal + wire), seed policies, health endpoint. | Skeleton committed; health endpoint returns real signals. Wire schemas document existing contracts. | Current |
| 1 | Evidence spine: inside Smart Security, write a decision record for every `/v1/scan/file` and `/v1/decide` call. | Every inbound request produces a persisted, queryable decision record. | Pending |
| 2 | Analyzer service: Cloud Run container running YARA-X + structural tools; port current suspicious-PDF markers into real rules; `/v1/scan/file` handler wires them up. | Analyzer handles existing scan logic as real rule evaluations. | Pending |
| 3 | Doctrine + Triage Agent: ingest NIST/CISA/OWASP/MITRE/D3FEND; every quarantine cites ≥2 doctrine sources. | First doctrine-cited quarantine decision recorded. | Pending |
| 4 | Responder Agent + session boundary intelligence: quarantine/revoke/rate-limit enforced; `/v1/decide` serves intelligent decisions with rolling baselines. | First reversible enforced action demonstrated with reversal path. | Pending |
| 5 | Internal feedback loop: weekly precision tracking, promotion governance, first observe→enforce promotion. | First rule promoted by formal precision criteria, not judgment. | Pending |
| 6 | Egress boundary + cross-tenant threat intel. | Known-bad hash from tenant A blocks tenant B pre-ingest. | Pending (year 2) |
| 7 | External API launch. | Conditional on year-2 trigger criteria below. | Pending |

## Year-2 external launch trigger criteria

All four must be true before opening the external API:

1. ≥12 months of clean observe-and-enforce operating data from AVIntelligence usage.
2. ≥500 AVIntelligence users protected in real-world operation.
3. Precision and false-positive rate measured per detection, ready to publish.
4. SOC2 Type 1 complete, tech E&O + cyber liability policy in place, Delaware C-Corp formed.

If these are not met when the window arrives, Smart Security remains an AVIntelligence feature. That is still a win: zero infrastructure spend to replace, hardened AVI, and unique content-marketing material.

## Infrastructure choices

| Concern | Choice | Rationale |
|---|---|---|
| Smart Security service host | Google Cloud Run | Always-free tier covers year 1 volume; scale-to-zero; pay-per-request. |
| Analyzer container host | Google Cloud Run | Same service region; can be a separate Cloud Run service or in-process. |
| Doctrine storage | Supabase Storage | No new vendor; existing stack. |
| Decision log | Supabase Postgres (new tables) | Existing stack; RLS-ready for year-2 multi-tenancy. |
| Evidence bucket | Supabase Storage bucket, access-restricted | Existing stack. Year 2 migrates to customer-held KMS. |
| Model provider chains | Anthropic (primary) → OpenAI → Google | Extends existing `providerChain()` pattern from `supabase/functions/_shared/ai-providers.ts`. |
| Repository layout | `smart-security/` at repo root | Self-contained; extraction to separate repo is trivial in year 2. |

## Pricing structure (held in reserve — year 2+)

Recorded for continuity. Not active in year 1. Smart Security is bundled into AVIntelligence tiers.

| Tier | Price | Role | Who it's for |
|---|---|---|---|
| Watch | $0 | Sensor network + marketing | Solo operators, indie SaaS |
| Defend Starter | $29/mo (annual only) | Self-serve growth tier | Small teams |
| Defend | $99/mo | Real revenue tier | Funded startups, early SaaS |
| Defend Pro | $299/mo | Enterprise/regulated | SOC2-requiring customers |

## Legal and compliance posture

| Concern | Year 1 posture | Year 2 posture |
|---|---|---|
| Liability exposure | Internal — AVIntelligence service-quality only | External tenants require tech E&O + cyber liability |
| SOC2 | Optional; start Type 1 when phase 4 approaches | Type 1 required before external launch; Type 2 in observation during year 2 |
| Entity | AVIntelligence PH | Add Delaware C-Corp as contracting entity for US customers |
| Insurance | Not required | $1M-$2M tech E&O + cyber liability, ~$3K-$7K/year |

## Doctrine sources (public corpus only)

Customer data never enters the doctrine store. Doctrine is read-only public material. Approved sources for phase 3 ingestion:

- NIST CSF 2.0, SP 800-53r5, SP 800-61r3 (incident handling), SP 800-207 (Zero Trust).
- CISA Known Exploited Vulnerabilities catalog, CISA advisories.
- OWASP Top 10:2025, ASVS 5.0, OWASP LLM Top 10, OWASP API Security Top 10.
- MITRE ATT&CK (enterprise + mobile + ICS), MITRE D3FEND.
- IETF RFCs for TLS, OAuth, OIDC, SCIM.
- Cloud provider security baselines (AWS, GCP, Azure) — public documentation only.

Explicitly excluded: proprietary certification course material (e.g., CCNP, CISSP course content). Internal doctrine may draw on principles taught in those programs, but copied material is prohibited.

## Continuous improvement

### Internal loop (incident-driven)

Every incident writes to `smart-security/memory/incidents/<id>/`. Weekly, the Investigator Agent runs a batch pass:

- Bucket incidents by `detection_id`.
- Compute per-rule precision (TP / (TP + FP)), recall against `false-negatives/`, median time-to-contain, median human-override rate.
- Propose YAML diffs to `detections/registry.json` and `policies/action-matrix.yaml`.
- Proposals land as commits for human review; no auto-merge.

A detection cannot be promoted from `observe` to `enforce` without:

- ≥4 weeks of operating data at `observe`.
- Precision ≥ promotion threshold defined per severity tier.
- A populated test corpus in `detections/corpora/<detection_id>/`.
- Explicit human commit to `policies/action-matrix.yaml`.

### External loop (doctrine ingestion)

Doctrine Agent runs on schedule against configured source list:

- Fetch → hash → diff against prior snapshot → chunk → embed → index.
- On diff, the agent opens a commit proposing mapping or rule updates.
- No auto-merge into `detections/` or `policies/`.

Retrieval at inference time: for each detection, Triage retrieves top-k chunks filtered by `(attack_id, cwe_id, product_context)`. Uncited classifications are rejected by the orchestrator and re-run.

## What is and isn't in this repository

**Committed to git**:
- Policies, detection rules, mappings, doctrine manifest, schemas (internal + wire), SKILL.md, playbooks, service READMEs.

**Not committed**:
- Doctrine chunk text (too large; lives in Supabase Storage with hashes in `knowledge/manifest.json`).
- Incident records (runtime; Supabase + Storage).
- Evidence artifacts (runtime; Supabase Storage).
- Customer data of any kind.

## Related files in repo

- `supabase/functions/prescan-document/index.ts:407` — Layer 1 wire call to `/v1/scan/file`. Observe mode in production.
- `proxy.ts:38` — Layer 2 wire call to `/v1/decide`. Observe mode by default; enforce requires `SMART_SECURITY_MIDDLEWARE_MODE=enforce`.
- `supabase/functions/_shared/ai-providers.ts` — existing provider-chain pattern that Smart Security extends.
- `docs/build-reference/reference-architecture.md` — establishes Smart Security as a separate service and observe-before-enforce rollout policy.

## Versioning

This document tracks architectural decisions. When a decision changes (e.g., analyzer host, model assignment, tier pricing, wire contract), update this doc in the same commit as the change and reference the commit SHA in the phase spec that follows.
