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
- Network-layer DDoS / edge WAF — outside Smart Security's application-layer mandate. The actual production edge layer must be verified before observe-to-enforce promotion; see `docs/smart-security-infra-hardening.md`.
- Offensive hack-back — legally prohibited and explicitly excluded.
- General-purpose SIEM — adjacent space; not our focus.

## Existing baseline (as of phase 0 complete)

Smart Security is a deployed Cloud Run service. Two AVIntelligence integration points call into it in observe mode today. **Neither is modified in phases 0-3.** The wire contracts below are frozen at the boundary; Smart Security phase work builds logic *behind* them.

**Deployment state (verified 2026-05-07)**:

- **Service repo**: `github.com/TitoDrewToo/smart-security` (private, TypeScript / Node.js).
- **Cloud Run service**: `smart-security` in `asia-southeast1`, GCP project `avint-core`, auto-scale 0–20.
- **Resolved via**: `SMART_SECURITY_URL`.
- **Real implementations live**:
  - ClamAV signature scanning (freshclam on container start, real signature DB).
  - Structural scanners for PDF active content, Office macros/ActiveX, CSV formula injection.
  - Signed-URL handoff with Supabase origin/bucket validation.
  - Observe-mode rollout pattern with fail-open/fail-closed env toggle.
  - `learning_record` foundation in scan response (`system_decision` + `human_label` fields) — feedback loop for future ML training data.
- **Service identity**: `smart-security-runner@avint-core.iam.gserviceaccount.com` with Artifact Registry Reader + Secret Manager Accessor.
- **Secrets in Secret Manager** (created 2026-04-23): `SMART_SECURITY_API_KEY`, `SMART_SECURITY_SUPABASE_SERVICE_ROLE_KEY`, `SMART_SECURITY_SUPABASE_URL`.

**Wired endpoints**:

| Layer | Caller in AVI repo | Endpoint on Smart Security service | Response vocabulary | Observe/enforce toggle |
|---|---|---|---|---|
| Ingress (file) | `supabase/functions/prescan-document/index.ts:407` | `POST /v1/scan/file` | `clean / suspicious / infected / scan_error` | `SMART_SECURITY_REQUIRED` |
| Session (request) | `proxy.ts:38` | `POST /v1/decide` | `allow / log_only / rate_limit / block / challenge` | `SMART_SECURITY_MIDDLEWARE_MODE` |
| Telemetry (events) | not yet wired in AVI | `POST /v1/events` | n/a (write-only) | n/a |

The third endpoint (`/v1/events`) exists on the deployed service for security-relevant activity logging from the protected app (rate-limit hits, suspicious paths, scanner events, abuse signals). AVIntelligence does not yet call it; a future phase wires it.

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

Response shape consumed by proxy.ts (on the deployed service the response also carries `risk_score`, `reason`, `fingerprint`, `ttl_seconds`, `mode`; AVIntelligence ignores these today, but Smart Security may rely on them for client-side caching in later phases):

```json
{ "decision": "allow | log_only | rate_limit | block | challenge" }
```

The `log_only` value is internal to Smart Security and treated as `allow` by `proxy.ts` today. Adding wire vocabulary requires coordinated cross-repo edits.

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

Primary threats defended against (AI-era-aware — incumbent vendors bolt AI onto pre-2020 detection engines; we design for an AI-saturated threat landscape from day 1):

1. **Malicious document uploads** — malware-laden PDFs, macro-embedded Office files, polyglot files, archive bombs.
2. **Synthetic / forged documents** — AI-generated invoice forgeries, fabricated receipts, synthetic identity docs designed to pass surface-level checks.
3. **Prompt injection on agentic workflows** — adversarial text in scanned documents that aims to subvert AVIntelligence's downstream LLM extraction (or Smart Security's own triage agent).
4. **OCR poisoning / prompt-in-metadata** — visually-obscured instructions in document content or EXIF/PDF metadata.
5. **AI-generated phishing / abuse content** — coherent, well-targeted phishing payloads at high volume; LLM-authored social-engineering text in document upload flows.
6. **Account takeover** — credential stuffing, session hijacking, session fixation, impossible-travel patterns.
7. **Data exfiltration via abnormal egress** — compromised edge functions making outbound calls to unusual destinations.
8. **Cross-tenant attacks** (Phase 6+ when external tenants exist) — hash reputation reuse, attacker reuse of infrastructure across tenants.

Explicitly out of scope for v1:

- Network-layer DDoS / edge WAF, except for documenting whether an edge layer is actually present before observe-to-enforce promotion.
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

Smart Security runs on **own-model inference** (Gemma 4 family, Apache 2.0). Third-party APIs are gap-fillers used only where a self-hosted equivalent does not yet exist or where an internal-only batch task does not justify the inference cost. The current in-scope model is base Gemma 4 E4B with prompts; fine-tuning is deferred unless scope explicitly reopens.

| Role | Function | Primary model | Gap-filler | Phase introduced |
|---|---|---|---|---|
| Triage Agent | Read-only classification of detection events; cites doctrine. | base Gemma 4 E4B + prompts | none | 3 |
| Responder Agent | Selects action from matrix; writes human-readable justification. | base Gemma 4 E4B + prompts; 26B A4B remains aspirational for complex / enterprise tier | none | 4 |
| Investigator Agent | Post-incident timeline + review + postmortem. | deferred → deferred → fine-tuned Gemma 4 26B A4B with extended-reasoning prompts | Anthropic API (Sonnet/Opus) on flat-fee internal use only, deprecated when v2.0 ships | 4 |
| Doctrine Agent | Ingests public frameworks, proposes rule updates. | base Gemma 4 26B A4B (batch) at v2.0 | Gemini batch API for bulk ingestion pre-v2.0 — non-realtime, not customer-facing | 3 |
| Orchestrator | Routes events, enforces action matrix, holds kill-switch, emits audit trail. | Deterministic TypeScript state machine — not an LLM. | — | 1 |
| Analyzer | ClamAV + structural scanners (live today); YARA-X + qpdf + pdfid + olevba added in phase 2. | Deterministic binaries; phase 2+ adds an E4B sanity-check on YARA matches before quarantine. | — | 2 |

Every LLM invocation records the exact model and version in the decision record (`actor_model`, `actor_model_version`). This is the regression-detection mechanism when models, prompts, dependencies, or future fine-tunes ship new versions. Pre-v2.0 third-party gap-filler calls record the provider's model id verbatim so the audit trail makes the source unambiguous.

## AI model strategy

Smart Security's current inference path is self-hosted base Gemma 4 E4B served through the internal `smart-security-llm` Cloud Run service. Fine-tuning is deferred indefinitely and is out of current scope. Any future training environment is TBD when that scope reopens; do not pre-commit to Vertex AI, local hardware, or any specific training platform.

### Why own-model

- **License clarity**: Gemma 4 (Apache 2.0) supports clean commercial externalization. Llama-derived models (e.g. Foundation-sec-8B) carry Llama license terms that complicate Phase 3 SaaS launch.
- **IP ownership**: if training scope reopens later, trained model weights can become a product asset rather than a recurring licensing dependency.
- **Cost economics at scale**: self-hosted inference cost flattens; per-call API costs scale linearly with usage. Crossover point is reached well below external-tenant volume.
- **Customization moat**: AVIntelligence's production telemetry (and, later, customer telemetry) is the most valuable training data for this domain. Fine-tuning against that data remains a future option, not current scope.
- **Avoid third-party dependency for a security capability**: Smart Security's value proposition collapses if its inference path is rate-limited, deprecated, or repriced by a third party.

### Model progression

| Version | Base | Fine-tune | Tier served | Budget envelope | Status |
|---|---|---|---|---|---|
| v0.5 | Gemma 4 E4B | none (system prompts only) | Internal proof-of-concept; AVIntelligence dogfood | ~$0 (Cloud Run free tier + GCP $300 credit) | Phase 0.5 |
| v1.0 | Gemma 4 E4B | deferred — not in current scope | Free / Pro tier (all customers at launch) | TBD if scope reopens | Deferred |
| v2.0 | Gemma 4 26B A4B (MoE: 26B total / ~4B active per token) | LoRA on accumulated production telemetry + curated public corpus | Enterprise tier (deep reasoning, complex multi-step analysis) | ~$5K–15K when MRR allows | Phase 2 |

### Scope discipline — match the model to the task

User-facing latency must feel *intentional*, not strained. Do not push E4B past its sweet spot.

**E4B sweet spot (v0.5 capabilities)**:
- File-level triage and verdict
- Pattern-match confirmation (YARA / structural rule + AI sanity check)
- Single-document analysis (vendor ID, document type, basic fraud markers)
- Standard PII detection
- Per-file finding narratives (one-liner explanations)
- Threat-intel summarization
- Simple categorization

**26B A4B domain (v2.0 features, gated until then)**:
- Cross-document fraud correlation
- Multi-step attack-chain reasoning
- Complex contract-anomaly detection
- Forensic incident reports with timelines
- IaC vulnerability analysis with attack-path simulation
- Strategic security recommendations
- Long-context analysis

Pro/Enterprise UI features that require 26B reasoning ship visible-but-disabled with "Available in v2.0" until the larger model's fine-tune is in production. Async queue UX is acceptable for slow analyses (intentional waits, not frozen pages). Low-confidence E4B cases surface as "needs analyst review" rather than forced guesses.

### Current development track

- **Production validation track**: E4B-powered v0.5 validates the serving, wiring, logging, and doctrine-citation pipeline.
- **Fine-tuning track**: deferred indefinitely. Reopen only after Phase 0.5 has measured results and there is an explicit scope decision.
- **R&D track**: future 26B A4B planning remains aspirational and gated on revenue and product need.

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

| Phase | Scope | Exit signal | Model | Status |
|---|---|---|---|---|
| 0 | Foundations: folder skeleton, schemas (internal + wire), seed policies, health endpoint. | Skeleton committed; health endpoint returns real signals. Wire schemas document existing contracts. | n/a | **Complete** |
| 0.5 | End-to-end model pipeline validation on Google Cloud free tier: stand up `smart-security-llm` Python+vLLM Cloud Run service serving base Gemma 4 E4B; AVIntelligence prescan calls the live LLM via the existing TS service; first prompts-only triage and finding narratives in production. | Base-E4B service answers a real triage call from production with cited doctrine, no out-of-pocket spend. | base Gemma 4 E4B | Pending |
| 1 | Evidence spine only: Supabase `smart_security_decision_log` table; every `/v1/scan/file`, `/v1/decide`, and `/v1/events` produces a queryable decision record. Fine-tuning is deferred and not in current scope. | Every inbound request produces a persisted decision record. Base-E4B evaluation baseline is measured but not yet used for training. | base Gemma 4 E4B | Deferred — not in current scope |
| 2 | Analyzer expansion: add YARA-X + qpdf + pdfid + olevba to the existing TS service alongside ClamAV/structural; port current suspicious-PDF markers into real YARA rules; `/v1/scan/file` decisions cite the firing rule. | Quarantine decision references a real YARA / structural rule, not a hand-coded marker. | unchanged | Pending |
| 3 | Doctrine + Triage Agent: ingest NIST/CISA/OWASP/MITRE/D3FEND; every quarantine cites ≥2 doctrine sources. | First doctrine-cited quarantine decision recorded. | unchanged | Pending |
| 4 | Responder Agent + session boundary intelligence: quarantine/revoke/rate-limit enforced; `/v1/decide` serves intelligent decisions with rolling baselines. | First reversible enforced action demonstrated with reversal path. | unchanged | Pending |
| 5 | Internal feedback loop: weekly precision tracking, promotion governance, first observe→enforce promotion. | First rule promoted by formal precision criteria, not judgment. | unchanged | Pending |
| 6 | v2.0 model + enterprise tier: fine-tune Gemma 4 26B A4B on accumulated telemetry; route enterprise-tier traffic to the larger model; cross-document correlation features unlock. | First enterprise-tier customer served by 26B model with measurably better complex-reasoning outcomes. | fine-tuned Gemma 4 26B A4B | Pending (gated on MRR) |
| 7 | Egress boundary + cross-tenant threat intel. | Known-bad hash from tenant A blocks tenant B pre-ingest. | unchanged | Pending |
| 8 | External-API public launch. | Conditional on Year-2 trigger criteria below. | unchanged | Pending |

## Year-2 external launch trigger criteria

All four must be true before opening the external API:

1. ≥12 months of clean observe-and-enforce operating data from AVIntelligence usage.
2. ≥500 AVIntelligence users protected in real-world operation.
3. Precision and false-positive rate measured per detection, ready to publish.
4. SOC2 Type 1 complete, tech E&O + cyber liability policy in place, Delaware C-Corp formed.

If these are not met when the window arrives, Smart Security remains an AVIntelligence feature. That is still a win: zero infrastructure spend to replace, hardened AVI, and unique content-marketing material.

## Two-service deployment topology

Smart Security runs as **two Cloud Run services**, language-matched to task:

```text
                                ┌────────────────────────────┐
                                │  AVIntelligence (Vercel)   │
                                │                            │
                                │  prescan-document  ──┐     │
                                │  proxy.ts          ──┤     │
                                └──────────────────────┼─────┘
                                                       │
                                                       │  HTTPS + x-smart-security-key
                                                       │  (POST /v1/scan/file, /v1/decide, /v1/events)
                                                       ▼
                          ┌──────────────────────────────────────────┐
                          │  Cloud Run: smart-security  (TypeScript) │
                          │  asia-southeast1, repo: TitoDrewToo      │
                          │                                          │
                          │  - ClamAV daemon                         │
                          │  - Structural scanners                   │
                          │  - Decision log writer (Phase 1)         │
                          │  - Triage / Responder gateways           │
                          │  - Wire translation layer                │
                          └────────────────────┬─────────────────────┘
                                               │
                                               │  internal HTTPS
                                               │  (POST /infer/triage, /infer/explain)
                                               ▼
                          ┌──────────────────────────────────────────┐
                          │  Cloud Run: smart-security-llm  (Python) │
                          │  vLLM + base Gemma 4 E4B                 │
                          │                                          │
                          │  - Stateless inference                   │
                          │  - Model artifacts from Cloud Storage    │
                          │  - GPU when active, scale-to-zero idle   │
                          └──────────────────────────────────────────┘
```

**Why two services**:

- **Language fit**: TypeScript for HTTP orchestration + scanner integration (Node ecosystem for ClamAV bindings, structural parsers, Supabase clients). Python for vLLM and Hugging Face model loading.
- **Independent scaling**: scanner traffic is many small requests; inference traffic is fewer, larger requests with different memory / GPU profiles.
- **Independent deploys**: a YARA rule update ships without re-deploying the LLM; an inference-service dependency update ships without disturbing the scanner.
- **Compliance scope clarity**: each service has its own audit trail, its own secrets, its own access posture.
- **Failure isolation**: if the LLM service is degraded, the scanner can still return deterministic decisions (`clean` for unsigned-clean files, fail-open for AI triage with a degraded-mode flag).

Both services share the doctrine + policies + schemas tree from `avint/smart-security/` via release-pinned snapshots — that folder is the source of truth, copied into each service's container at build time.

## Infrastructure choices

| Concern | Choice | Rationale |
|---|---|---|
| Scanner service host (existing) | Google Cloud Run — `smart-security` (TypeScript) in `asia-southeast1` | Already deployed; ClamAV + structural live; auto-scale 0–20. |
| LLM inference service host (new) | Google Cloud Run — `smart-security-llm` (Python + vLLM) | Separate container; language-appropriate per task; scales to zero. Phase 0.5 stands this up on free tier with base Gemma 4 E4B. |
| Model training | Deferred indefinitely; future environment TBD | Not in current scope. Do not commit to Vertex AI, local hardware, or any training platform until scope reopens. |
| Model artifact storage | Google Cloud Storage | Base-model and future artifact handoff to Cloud Run if needed. |
| Decision log | Cloud SQL Postgres (Smart Security's own DB) | Within the Smart Security boundary; RLS-ready for multi-tenancy from day 1. AVIntelligence's Supabase Postgres remains separate. |
| Evidence bucket | Cloud Storage bucket per tenant, access-restricted | Within Smart Security's project. Year-2 / enterprise migrates to customer-held CMEK keys. |
| Doctrine storage | Cloud Storage + Cloud SQL pgvector | Public corpus only; chunk text in Cloud Storage, vector index in pgvector. |
| Threat-intel + telemetry warehouse | BigQuery | `learning_record` rows from the scanner stream here for analytics and future optional data curation. |
| Inference fallback (pre-v1.0 only) | Anthropic / Gemini API for Investigator and Doctrine ingestion | Used as gap-fillers, not user-facing. Removed when v1.0 / v2.0 ships. |
| Repository layout | Two separate GitHub repos: `TitoDrewToo/smart-security` (TS scanner) + new `smart-security-llm` (Python LLM service). The local `avint/smart-security/` folder holds doctrine/policies/schemas as the canonical source for both. | Clean compliance scoping (SOC 2 / ISO 27001 audits scope to repo); architectural discipline; independent deploy cadence; the `avint/smart-security/` doctrine folder is consumed by both repos via release-versioned snapshots in later phases. |
| Build orchestration | Antigravity Agent Manager (installed; billing TBD) | Native GCP integration for Cloud Run, IAM, Cloud Logging, and service-build workflows. Composes specialized agents (architecture, API contract, detection rules, service build, prompt engineering, validation, compliance/docs). |
| Status of `avint/smart-security/` folder | Doctrine + policies + schemas + agent SKILL contract, in-repo for year 1 | Source of truth for action matrix, schemas, and operational skill. Consumed by the Cloud Run services via release-pinned snapshots; survives any future repo extraction. |

## Commerce model — avintph.com as unified portal

Smart Security customer-facing commerce runs through **avintph.com**, the same portal that sells AVIntelligence products. Smart Security is **not** a separate pricing site or customer dashboard. Same brand, same Creem integration, same customer dashboard.

Why this is the correct shape:

- One brand, one purchase flow, one customer dashboard.
- Natural cross-sell — AVIntelligence customers see Smart Security API tiers in the same /pricing page.
- Compliance scoping: customer-facing surfaces audited as one. Smart Security backend audited separately for SOC 2 / ISO 27001.
- Less duplicate work — no second pricing page, no second dashboard, no second support channel.

### Customer flow (Pattern B)

1. Customer visits avintph.com → /pricing → sees AVIntelligence products + Smart Security API tiers in the same surface.
2. Customer purchases a Smart Security tier via Creem (existing checkout flow).
3. Creem webhook → avintph.com server → calls Smart Security `POST /v1/admin/keys` (new admin endpoint, phase 2) with tenant info.
4. Smart Security generates an `ssk_xxx` API key, stores it tagged to `tenant_id`, returns the key.
5. avintph.com customer dashboard displays the key once, shows integration docs, links to the API reference.
6. Customer integrates: their app calls Smart Security directly with the key.
7. avintph.com customer dashboard polls Smart Security `GET /v1/admin/usage` for display + billing reconciliation.

### Two auth paths in Smart Security

- **Customer-facing**: API key in `Authorization` header (or `x-smart-security-key`) for scan / decide / events calls.
- **Internal admin**: service-to-service auth between avintph.com and Smart Security for provisioning + usage queries.

AVIntelligence's `prescan-document` is itself a customer (tenant `avint-prod`) using a customer-style API key. There is no special path for AVIntelligence — the same API contract serves all tenants, AVIntelligence first.

### Pricing tiers (held in reserve — Phase 6+ / external launch)

Recorded for continuity. Not active before external launch. Tier mapping aligns with model capability:

| Tier | Price | Model serving the tier | Role | Who it's for |
|---|---|---|---|---|
| Watch | $0 | base Gemma 4 E4B + prompts | Sensor network + marketing | Solo operators, indie SaaS |
| Defend Starter | $29/mo (annual only) | base Gemma 4 E4B + prompts until training scope reopens | Self-serve growth tier | Small teams |
| Defend | $99/mo | base Gemma 4 E4B + prompts until training scope reopens | Real revenue tier | Funded startups, early SaaS |
| Defend Pro | $299/mo | fine-tuned Gemma 4 26B A4B (when v2.0 ships) | Enterprise / regulated | SOC 2-requiring customers |

The customer-facing API contract is identical across tiers; routing happens server-side based on `tenant_id` → tier → model.

## Legal and compliance posture

**Compliance is a P1 design objective, not a Phase 3 retrofit.** The system is built so that SOC 2 / ISO 27001 application is an evidence-collection exercise at audit time, not an architecture rewrite.

### Architectural controls baked in from Phase 1 build

1. **Comprehensive audit logging** — every action, every scan decision, every policy change logged with timestamp, actor, payload integrity. Cloud Logging + BigQuery archive.
2. **Data residency clarity** — single region per tenant (`asia-southeast1` today; multi-region option for enterprise), documented in customer-facing pages and audit reports.
3. **Granular access controls** — RLS in Cloud SQL Postgres, IAM in GCP, principle of least privilege, MFA on admin accounts.
4. **Encryption** — TLS 1.2+ in transit, AES-256 at rest (default GCP), customer-managed keys (CMEK) wired for enterprise tier.
5. **Backup + DR** — automated Cloud SQL backups, RPO ≤ 24h, RTO ≤ 4h, quarterly DR drills documented.
6. **Incident response procedures** — runbook, escalation path, evidence preservation, customer-notification SLAs.
7. **Change management** — PR review, deployment approvals, automated test gates, post-deployment verification.
8. **Vendor risk management** — every third-party (Frankfurter, Anthropic gap-filler, Gemini gap-filler, Supabase, Creem) documented with DPA / data-flow analysis.
9. **Vulnerability management** — automated dependency scans, CVE tracking, patch cadence.
10. **Personnel security** — background checks, NDAs, access offboarding procedures (when team grows beyond solo).

### Phased posture

| Concern | Phase 1 build | Phase 2 mature internal | Phase 3 external launch prep |
|---|---|---|---|
| Liability exposure | Internal — AVIntelligence service-quality only | Same as Phase 1 | External tenants require tech E&O + cyber liability |
| SOC 2 | All controls in place; collecting evidence | 6+ months of operating evidence | Formal Type II audit (~$30K–50K, 3–6 months) |
| ISO 27001 (optional) | Not started | Optionally begin scoping | Audit (~$40K–60K, longer timeline) for international/enterprise customers |
| Entity | AVIntelligence PH | Same | Add Delaware C-Corp as contracting entity for US customers |
| Insurance | Not required | Not required | $1M–$2M tech E&O + cyber liability, ~$3K–$7K/year |

### Why P1

- Compliance reputation is a differentiator vs. "secure" claims without certs.
- Faster enterprise sales when SOC 2 Type II is in hand.
- Audit-ready architecture is harder to retrofit than to design in.
- Builds dev-team credibility and inspires customer confidence.

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

**Doctrine retrieval pattern (Phase 3+):** retrieval uses an iterative four-phase loop — DISPATCH (broad initial keyword/pattern query against the doctrine corpus filtered by `attack_id` and `cwe_id`), EVALUATE (relevance score 0–1 per chunk; identify gaps), REFINE (extract codebase-and-corpus terminology from high-scoring hits, add to query; exclude confirmed-irrelevant paths), LOOP (max 3 cycles, stop when >=3 high-relevance chunks AND no critical gaps remain). This pattern does not require a vector index on day one — Phase 3 ships with keyword/pattern retrieval over the static seed corpus; vector retrieval is a Phase 5+ optimization, not a Phase 3 prerequisite. Reference: `arabicapp/everything-claude-code:skills/iterative-retrieval/SKILL.md`.

## Build orchestration — Antigravity Agent Manager

Smart Security's build is composed via **Antigravity Agent Manager** (installed locally; GCP billing to be confirmed before any deploy work). Antigravity is the *development and deployment orchestration* environment. Training is deferred indefinitely and no training platform is selected.

### Three-layer infrastructure

| Layer | Role | Cost shape |
|---|---|---|
| Antigravity | Dev environment, agent orchestration, code authoring, deploy pipeline | Subscription (TBD pricing) |
| Training environment | Deferred; future platform TBD if scope reopens | No current cost commitment |
| Cloud Run + GPU | Production inference serving | $0.50–3.00 / GPU-hour active time; scales to zero |

Cloud Storage is the connective tissue for model artifacts and deployment handoff between layers.

### Agent team

Specialized agents composed in Antigravity, each with a narrow mandate:

| Agent | Mandate | Activation phase |
|---|---|---|
| Architecture Documentation | Inventory existing service AS-IS, design extension points, keep this doc current. | 0.5 |
| API Contract | Extend existing OpenAPI spec on the TS scanner; design `smart-security-llm` API; surface contract diffs as PR review material. | 0.5 |
| Code Inventory (one-time) | Capability inventory of the existing TS service (`defender.ts`, `scan.ts`, `scanners/`) so subsequent agents do not duplicate or contradict. | 0.5 |
| Service Build | Build `smart-security-llm` Python service + integration code in the existing TS service. | 0.5 → 1 |
| Dataset Curation | Pull public security corpora and gate with provenance + license if future training scope reopens. | Deferred |
| Detection Rules | Generate YARA / Sigma candidates from threat intel; human review before merge. | 2 |
| Prompt Engineering | Tune base-E4B prompts; record evaluations against benchmark harness. | 0.5 |
| Reasoning Specialization | Multi-step reasoning fine-tune for v2.0 (26B A4B). | 6 |
| Domain Adaptation | Retrain on AVIntelligence + first external customer telemetry as it accumulates. | 6 |
| Validation / Testing | Precision + FP-rate measurement, sample testing, drift detection. | 1 |
| Compliance / Docs | SOC 2 evidence trails, security policies, audit log review, customer-facing docs. | 1 |

### Pre-flight

Before any agent deploys or changes cloud infrastructure:

1. **GCP billing alerts + per-month spend caps** must be active on `avint-core` to prevent runaway costs.
2. **Cloud Run GPU quota requested** for inference (default quota is 0).
3. **Service account roles** scoped per agent — least privilege.

These are explicit prerequisites for Phase 0.5 to start.

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
- `supabase/functions/_shared/ai-providers.ts` — provider-chain pattern; used today by AVIntelligence's own AI flows. Smart Security's own-model strategy means it does **not** extend this pattern.
- `app/api/smart-security/health/route.ts` — health endpoint that reads doctrine + schemas from `smart-security/`; doubles as an integrity check on the doctrine snapshot.
- `smart-security/SKILL.md` — operational contract for agents. Authoritative for the "never do" list and the loop.
- `smart-security/policies/action-matrix.yaml` — autonomous-action source of truth.
- `docs/smart-security-phase-0.md` — Phase 0 spec (status: complete).
- `docs/smart-security-phase-0.5.md` — Phase 0.5 spec (current target — base-Gemma 4 E4B end-to-end on free tier).
- `docs/build-reference/reference-architecture.md` — establishes Smart Security as a separate service and observe-before-enforce rollout policy.

## Related external repos

- `github.com/TitoDrewToo/smart-security` — deployed TypeScript scanner service (Cloud Run, `asia-southeast1`).
- `smart-security-llm` (Python + vLLM) — to be created in Phase 0.5; serves Gemma 4 model family.

## Versioning

This document tracks architectural decisions. When a decision changes (model assignment, infrastructure host, tier pricing, wire contract, commerce model, compliance posture), update this doc in the same commit as the change and reference the commit SHA in the phase spec that follows.

### Change log

- **2026-05-07** — Major roadmap update. Reframed agent-role models from third-party to own-model Gemma 4 progression (v0.5 / v1.0 / v2.0). Added two-service deployment topology, build orchestration via Antigravity, unified commerce via avintph.com (Smart Security tiers in the same portal as AVIntelligence products). Elevated compliance to P1. Confirmed deployed-state baseline of `github.com/TitoDrewToo/smart-security`. Phase plan extended to cover model progression and external-tenant gates.
