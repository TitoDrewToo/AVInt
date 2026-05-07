# Smart Security — Phase 0.5 Implementation Spec

**Goal**: validate the end-to-end LLM-inference pipeline in production at zero out-of-pocket spend. Stand up the `smart-security-llm` Cloud Run service (Python + vLLM + base Gemma 4 E4B), wire it from the existing TypeScript scanner service, and have AVIntelligence dogfood real triage / finding-narrative calls in observe mode.

**Reference context**: read `docs/smart-security-architecture.md` first — especially *Existing baseline*, *AI model strategy*, *Two-service deployment topology*, and *Build orchestration*.

## 1. Why this phase exists

Phase 0 produced the doctrine + schema foundation. Phase 1 commits compute spend. **Phase 0.5 is the de-risking step in between**: prove that the deploy-and-serve pipeline works end-to-end on the free tier before committing the Phase 1 fine-tune budget. If something is wrong with the topology, model loading, latency, or wire integration, we discover it for $0 instead of mid-fine-tune.

Exit signal: a real production triage request from AVIntelligence's `prescan-document` reaches `smart-security-llm`, returns a base-Gemma 4 E4B response with cited doctrine, and is logged to the decision record — all within free-tier budget.

## 2. Pre-flight (block on these — do not start until done)

- [ ] **GCP billing alerts** active on `avint-core` project: `$25/mo` warning, `$50/mo` hard cap.
- [ ] **Vertex AI API** enabled (`vertex-ai.googleapis.com`) — needed even for inference helpers.
- [ ] **Cloud Run GPU quota requested** — default quota is 0; submit quota request for `1` GPU in `asia-southeast1`. Approval can take 1–3 business days.
- [ ] **Antigravity Agent Manager billing confirmed** before any agent submits a deploy.
- [ ] **Service account** `smart-security-llm-runner@avint-core.iam.gserviceaccount.com` created with: Artifact Registry Reader, Secret Manager Accessor, Cloud Storage Object Viewer (for model weights).
- [ ] **GitHub repo `smart-security-llm`** created (private), CI scaffolding (build + push to Artifact Registry).
- [ ] **Google Cloud $300 free credit** confirmed available on `avint-core`.

## 3. Scope

In scope:

- New `smart-security-llm` repo + Cloud Run service.
- Container image: Python 3.11, vLLM, Gemma 4 E4B weights pulled from Hugging Face (or Cloud Storage if licensing requires).
- Two endpoints:
  - `POST /infer/triage` — file/event triage + cited doctrine.
  - `POST /infer/explain` — finding narrative (one-liner explanation suitable for surfacing in AVIntelligence UI).
- Authentication: shared internal-service token (Secret Manager); not customer-facing.
- Wiring: existing `smart-security` TS service calls `smart-security-llm` from its `scan.ts` flow and `decide.ts` flow when the AI-triage feature flag is on.
- Doctrine retrieval stub: read top-k from a static seed corpus (no vector DB yet — Phase 3 builds the real one). Cite at minimum `attack_id` and a doctrine source path.
- Decision-record write on every inference call (extends Phase 1 evidence spine; in Phase 0.5 the table may not yet exist — write to Cloud Logging structured logs as the interim store).
- Health endpoint: `/health` returns `{ ok, service, model_id, model_loaded, free_tier_budget_remaining_estimate }`.

Out of scope (deferred):

- Fine-tuning. Base model only.
- Real vector index for doctrine. Static seed corpus is sufficient for validation.
- Customer API key issuance. Service-to-service token only.
- Multi-tenant key validation. Tenant defaults to `avint-prod` everywhere.
- Cloud SQL Postgres decision-log table. Cloud Logging is the interim store.
- BigQuery ingestion of `learning_record`.

## 4. Success criteria

- [ ] `smart-security-llm` Cloud Run service is reachable and responds to `/health` with `model_loaded: true`.
- [ ] A `POST /infer/triage` call from `smart-security` (TS) returns within p95 ≤ 8s for E4B inference with k=3 doctrine citations.
- [ ] AVIntelligence's `prescan-document` triggers a real triage call on production upload (observe mode — finding is recorded but not surfaced to the user yet).
- [ ] Decision record (Cloud Logging structured) shows the full chain: prescan → scanner service → LLM service → triage response with cited doctrine.
- [ ] Free-tier monthly burn estimate after 1 week of dogfood traffic ≤ $5. If higher, stop and reassess.
- [ ] No code path on the AVIntelligence side modifies `prescan-document` or `proxy.ts` beyond reading new feature flags. The wire contract stays frozen.

## 5. Out-of-bound failure modes (kill the phase if these happen)

- Cold-start time exceeds 30s. (Suggests the model is too large for free-tier startup; reassess E4B specifics.)
- Cloud Run GPU quota denied. (Phase 0.5 cannot proceed; escalate quota request.)
- Free-tier monthly burn estimate after 1 week exceeds $20. (Topology is wrong; reassess before committing more compute.)
- Latency exceeds 15s p95. (User-facing UX would feel broken; reassess model size or runtime.)

## 6. Implementation order

1. Stand up the new repo + CI.
2. Build the container image locally; verify model loads + serves a single prompt.
3. Deploy to Cloud Run with `min_instances=0`, GPU = 1 (NVIDIA L4 or T4 in free-tier-eligible region).
4. Wire the TS scanner service to call `smart-security-llm` behind a feature flag (`SMART_SECURITY_LLM_ENABLED=false` by default).
5. Flip the flag to `true` for AVIntelligence's tenant only; observe production traffic for one week.
6. Measure: latency p50/p95, cold-start frequency, $burn estimate, doctrine-citation quality (manual sample).
7. Write the Phase 0.5 retrospective into `smart-security/memory/reviews/phase-0.5.md` (locally, not committed — it contains operational data).
8. Decide: proceed to Phase 1 (fine-tune) or iterate on Phase 0.5.

## 7. Hand-off to Phase 1

Phase 1 (evidence spine + first fine-tune) requires:

- Phase 0.5 retrospective complete with measured precision baseline on a labeled sample of triage decisions (use AVIntelligence's accumulated upload corpus).
- Cloud SQL Postgres `smart_security_decision_log` table provisioned.
- Multi-tenancy schema in place (even though only `avint-prod` exists).
- Curated training corpus assembled (public + telemetry).
- Fine-tune training pipeline proven on a tiny sample (one-tenth of full run cost).
- Budget alert at $50/mo confirmed not exceeded by Phase 0.5 dogfood.

Nothing in Phase 0.5 should foreclose any of these.
