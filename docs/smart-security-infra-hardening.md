# Smart Security — Infra Hardening Punch List

Pre-Phase-1 cloud infra hardening tasks derived from external review (cloud-infrastructure-security patterns), fitted to GCP. None of these block Phase 0.5; all should be addressed before Phase 1 evidence-spine work begins.

## 1. CI/CD auth — migrate to Workload Identity Federation

**Current state:** Antigravity and any other CI tooling that touches GCP uses long-lived service-account keys.
**Target:** Workload Identity Federation (OIDC). Antigravity authenticates via federated tokens; no long-lived keys stored anywhere outside Secret Manager.
**Why:** long-lived keys are the leading cause of lateral-movement-after-CI-compromise incidents. WIF tokens are short-lived and bound to specific identities.
**Possible outcomes:** ✅ already done / 🟡 action item / ❌ explicit gap accepted / ❓ research first.
**Owner:** TBD.
**Gate:** before any CI tooling that can deploy production services.

## 2. Edge-layer protection — verified state and deferred-accept-gap decision

**Current state (verified 2026-05-10):**

- Production hostname: `avintph.com` (apex `216.198.79.1`, www CNAME → `ab032a0185e5b82c.vercel-dns-017.com`).
- Registrar + DNS hosting: **Porkbun** (nameservers `*.ns.porkbun.com`).
- Edge / hosting layer: **Vercel** (verified via DNS resolution to Vercel edge IPs).
- DDoS protection: Vercel's built-in L3/L4 mitigation, included on all Vercel plans.
- WAF: Vercel Firewall on whatever current plan supports. **No Cloudflare in stack.** No third-party WAF.
- The architecture doc's prior "Network-layer DDoS — handled by Cloudflare" claim was incorrect and has been reconciled to name Vercel as the verified edge.

**Decision (2026-05-10): 🟡 deferred — explicit accept-gap.**

For the current stage, Vercel's built-in edge mitigation is sufficient. Adding Cloudflare in front of Vercel for OWASP managed ruleset coverage is technically supported but introduces real costs (Pro tier $20/mo minimum for managed rulesets, half-day configuration, two cache layers and two firewall surfaces to debug, potential Cloudflare-cache-vs-Vercel-deploy interactions) that are not justified by current threat exposure. Smart Security's `/v1/decide` endpoint is being built to provide application-layer inspection at exactly this level; the WAF gap Cloudflare would fill is partially the gap Smart Security itself is being built to fill, just one phase out.

**Reopen criteria (any one triggers reevaluation):**

1. Smart Security `/v1/decide` observe-mode reveals attack patterns the Vercel edge isn't suppressing.
2. Traffic / abuse scales beyond Vercel Firewall's effective coverage on the current plan.
3. Compliance or customer requirement specifically asks for OWASP-managed-ruleset coverage.
4. A specific incident motivates it.
5. Vercel deprecates or materially changes its edge mitigation posture.

**If reopened, configuration cost:** ~half a day. Steps: change Porkbun NS to Cloudflare's, configure Cloudflare DNS pointing at Vercel, enable proxy (orange cloud), set TLS mode (Full strict), upgrade to Pro for OWASP managed ruleset, configure rate-limiting rules per protected prefix in `proxy.ts:7`, configure cache rules to not interfere with Vercel cache.

**Owner:** TBD on reopen.
**Gate:** none for Phase 0.5; revisit at observe-to-enforce promotion gate.

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
