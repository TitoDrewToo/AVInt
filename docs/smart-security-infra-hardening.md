# Smart Security — Infra Hardening Punch List

Pre-Phase-1 cloud infra hardening tasks derived from external review (cloud-infrastructure-security patterns), fitted to GCP. None of these block Phase 0.5; all should be addressed before Phase 1 evidence-spine work begins.

## 1. CI/CD auth — migrate to Workload Identity Federation

**Current state:** Antigravity and any other CI tooling that touches GCP uses long-lived service-account keys.
**Target:** Workload Identity Federation (OIDC). Antigravity authenticates via federated tokens; no long-lived keys stored anywhere outside Secret Manager.
**Why:** long-lived keys are the leading cause of lateral-movement-after-CI-compromise incidents. WIF tokens are short-lived and bound to specific identities.
**Possible outcomes:** ✅ already done / 🟡 action item / ❌ explicit gap accepted / ❓ research first.
**Owner:** TBD.
**Gate:** before any CI tooling that can deploy production services.

## 2. Edge-layer protection — confirm what's actually in front of the app

**Current state (verified 2026-05-10):** `dig NS avintelligence.app` and `dig avintelligence.app` both returned `NXDOMAIN`. The architecture doc's prior "Network-layer DDoS — handled by Cloudflare" claim has been reconciled; Cloudflare is not verified for the `avintelligence.app` apex because the apex itself is not resolving.
**First verify:** the actual production hostname and which edge layer (if any) is proxying its traffic.

- Run `dig NS <production-hostname>` and `dig <production-hostname>` to inspect nameservers and A records.
- Possible outcomes:
  - Cloudflare nameservers + proxy active → Cloudflare in stack. Move to WAF/ruleset state evaluation.
  - Cloudflare nameservers + proxy off (grey cloud) → DNS only, no edge protection. Reconcile architecture doc.
  - Vercel direct → Vercel's built-in edge protection is the only layer. Reconcile architecture doc; Vercel-edge defaults are sufficient for current stage but lack OWASP managed ruleset.
  - Other / direct DNS → no edge layer. Reconcile architecture doc; flag as gap.
  - NXDOMAIN → hostname is not active. Confirm the canonical production hostname before evaluating edge protection.

**Then evaluate (only if Cloudflare proxy active):** Cloudflare tier and what's enabled — managed OWASP ruleset, rate-limiting on `/api/*`, bot protection. Free tier does not include managed rulesets; upgrading to Pro/Business/Enterprise is a real-money decision.

**Possible outcomes after evaluation:**

- ✅ Already protected at the level we want — close out, update architecture doc to be accurate.
- 🟡 Action: enable available controls on current tier (free includes basic rate-limiting rules and security level toggles).
- 🟡 Decide: upgrade Cloudflare tier vs. accept managed-ruleset gap.
- ❌ No edge layer in stack — explicit gap to track in roadmap; Smart Security `/v1/decide` becomes the only inspection layer until edge gets built.

**Why:** the protected prefixes in `proxy.ts:7` are exactly the surface a managed OWASP ruleset is designed for. Smart Security's `/v1/decide` is a complementary inspection layer, not a replacement for an edge WAF.
**Owner:** TBD.
**Gate:** before observe-to-enforce promotion at any layer.

## 3. Secret rotation cadence

**Current state:** secrets in Secret Manager (`SMART_SECURITY_API_KEY`, `SMART_SECURITY_SUPABASE_SERVICE_ROLE_KEY`, `SMART_SECURITY_SUPABASE_URL`, `SMART_SECURITY_LLM_INTERNAL_TOKEN`). Rotation is manual and ad-hoc.
**Target:** documented quarterly rotation cadence per secret, with a rotation-runbook in `smart-security/policies/`. Database credentials (Supabase service role) on a separate quarterly cycle from API keys.
**Why:** the project doc's "two-key reality" section (`CLAUDE.md`) shows secret-key drift between vault and edge functions has caused outages — rotation discipline reduces blast radius if a key is exposed.
**Possible outcomes:** ✅ already done / 🟡 action item / ❌ explicit gap accepted / ❓ research first.
**Owner:** TBD.
**Gate:** before Phase 1.

## 4. Cloud Run service identities — least privilege audit

**Current state:** `smart-security-runner@avint-core.iam.gserviceaccount.com` and `smart-security-llm-runner@avint-core.iam.gserviceaccount.com` exist with the documented roles (Artifact Registry Reader, Secret Manager Accessor, Cloud Storage Object Viewer, Cloud Logging Log Writer).
**Target:** confirmed least-privilege audit — each role grant has a justification line tying it to a specific function-level capability. Any over-provisioning gets revoked.
**Why:** standard hygiene. If smart-security-llm gets compromised, blast radius is whatever its service account can touch.
**Possible outcomes:** ✅ already done / 🟡 action item / ❌ explicit gap accepted / ❓ research first.
**Owner:** TBD.
**Gate:** before observe-to-enforce promotion.

## 5. Cloud Logging retention — confirm 90+ day retention

**Current state:** structured logging via `_shared/log.ts` going to Cloud Logging. Retention configuration unverified.
**Target:** 90+ day retention on the `smart-security-events` and `smart-security-llm-events` log buckets.
**Why:** decision-record audit trail. Phase 1 promotes this from Cloud Logging to Cloud SQL; until then, Cloud Logging is the only audit store. 30-day default would lose evidence before the next quarterly review.
**Possible outcomes:** ✅ already done / 🟡 action item / ❌ explicit gap accepted / ❓ research first.
**Owner:** TBD.
**Gate:** before any production traffic hits the LLM service in observe mode for the dogfood week.

---

Reference: external review of cloud-infrastructure-security patterns; fitted to GCP and to the existing avint architecture.
