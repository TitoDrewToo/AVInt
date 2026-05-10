# Smart Security Claude Handoff - Autonomous Defense Additions

Date: 2026-05-09
Audience: Claude, after usage limits reset
Status: Discussion draft only. Do not merge into canonical roadmap until reviewed with the user.

## Purpose

Capture proposed additions to the existing Smart Security roadmap after reviewing Threat Vector Security's public agent-security work, especially GuardianAgent and Agentic Boundary Bench.

This is not a replacement for the existing Smart Security roadmap. The intent is to confirm which concepts should be added to the already documented direction in:

- `docs/smart-security-architecture.md`
- `docs/smart-security-phase-0.5.md`
- `smart-security/SKILL.md`
- `smart-security/policies/action-matrix.yaml`
- `smart-security/policies/evidence.yaml`

The user expects some pushback and wants the discussion first. Treat these as proposed roadmap uplifts, not accepted scope.

## User Positioning Clarification

Pentesting is not a customer-facing Smart Security feature or service offering.

It is an internal development capability for Smart Security itself, used to improve autonomous defense, evaluate agent behavior, harden policies, generate adversarial tests, and validate future security models.

Positioning:

- External product: AI-powered security layer for file storage, workflow defense, anomaly detection, and controlled response.
- Internal capability: adversarial testing, red-team simulation, boundary benchmarks, and pentest-style validation used to improve the product.
- Not offered: AI pentesting as a service for customer systems.

This distinction should be preserved in docs so Smart Security remains defensively scoped while still using offensive testing techniques internally.

## Why This Came Up

Threat Vector's public repos are not a direct product copy target, but they contain useful architecture patterns for later Smart Security phases:

- GuardianAgent: policy-gated agent runtime, tool mediation, approvals, output guarding, audit, trust labels.
- Agentic Boundary Bench: adversarial benchmark harness for agentic security boundaries.
- Context/security concepts: trust classification, tainted context handling, brokered execution, and evidence-based action control.

The user believes there is more overlap than a surface product comparison suggests. The overlap is mainly at the autonomous-defense layer, not at the current Smart Security product page or year-1 file scanning layer.

## Proposed Additions To Existing Roadmap

### 1. Security Action Envelope

Before any future autonomous or semi-autonomous action, define a durable action envelope:

- `event_id`
- `tenant_id`
- `action_type`
- `scope`
- `risk_level`
- `policy_version`
- `evidence_refs`
- `model_id`
- `model_version`
- `confidence`
- `trust_level`
- `taint_reasons`
- `approval_status`
- `action_hash`
- `verification_status`

Purpose: every action becomes explainable, replayable, auditable, and approval-bound.

### 2. Deterministic Admission Pipeline

Add an explicit admission pipeline before Responder actions:

1. Normalize request/action intent.
2. Sanitize metadata and user-controlled text.
3. Attach trust and taint labels.
4. Enforce tenant and scope boundary.
5. Enforce action-matrix policy.
6. Enforce reversible-only constraint.
7. Enforce confidence and evidence thresholds.
8. Require approval when policy says so.
9. Persist decision record before execution.

This aligns with the existing principle that orchestration is deterministic and LLMs fill bounded roles.

### 3. Responder Tool Control Plane

The Responder Agent should not directly execute arbitrary actions. It should propose `ActionIntent` objects to a deterministic executor.

Initial defensive action catalog should stay small and reversible:

- `quarantine_file`
- `mark_suspicious`
- `allow_with_watch`
- `rate_limit_subject`
- `challenge_session`
- `create_incident`
- `notify_admin`
- `add_rule_candidate`

Irreversible actions remain forbidden without explicit human approval. Customer data deletion remains forbidden autonomously.

### 4. Trust-Aware Evidence

Every signal should carry trust metadata:

- deterministic scanner output
- LLM triage output
- file metadata
- user-provided filename/content
- third-party threat intelligence
- cross-tenant reputation
- manual analyst labels

Untrusted or tainted evidence can inform triage, but should not independently authorize enforcement.

### 5. Quarantined Memory And Learning Records

Raw hostile documents, prompt-injection text, suspicious metadata, and unreviewed LLM conclusions should not become trusted memory or training material automatically.

Suggested memory states:

- `raw_untrusted`
- `quarantined`
- `reviewed`
- `promoted`
- `rejected`

This should extend the existing `learning_record` foundation rather than replace it.

### 6. Brokered LLM Isolation

The future `smart-security-llm` service should classify and explain only.

It should not have:

- Supabase service-role access
- direct storage mutation capability
- direct action execution capability
- direct customer-facing API exposure
- unrestricted outbound tooling

The TypeScript Smart Security service remains the orchestrator, policy engine, audit writer, and action executor.

### 7. Output Guard For Triage Narratives

Before any LLM-generated triage narrative reaches logs, dashboard UI, customer-facing findings, or support artifacts, pass it through an output guard:

- redact secrets
- redact sensitive PII where appropriate
- suppress or neutralize prompt-injection text
- attach evidence references
- avoid unsupported claims

### 8. Smart Security Boundary Bench

Create an internal benchmark inspired by Agentic Boundary Bench, scoped to our product:

- malicious PDF active content
- Office macro or ActiveX payload
- CSV formula injection
- prompt injection inside uploaded document text
- OCR or metadata prompt injection
- signed URL bucket/path abuse
- storage-path fallback abuse
- SSRF attempt to cloud metadata
- session/request abuse through protected routes
- policy-widening attempt
- responder attempts irreversible action

Suggested outcomes:

- `blocked_cleanly`
- `observed_suspicious`
- `quarantine_required`
- `approval_required`
- `false_positive`
- `missed`
- `not_applicable`
- `error`

### Grading framework: Eval-Driven Development with pass@k

Each adversarial scenario is a **capability eval**. Observe-mode shadow comparisons against the deterministic scanner baseline are **regression evals**.

Grader types per scenario:

- **Code-based** (deterministic) — for outcomes that are mechanically verifiable (e.g. `blocked_cleanly` confirmed by absence of file persistence; `quarantine_required` confirmed by quarantine-bucket write).
- **Model-based** (LLM judge) — for outcomes requiring narrative judgment (e.g. `false_positive` vs `observed_suspicious`).
- **Human-flag** — mandatory for any scenario with `approval_required` outcome and any new attack family before promotion.

Metrics:

- **pass@k** — at least one success across k attempts. Target pass@3 >= 90% on noisy scenarios.
- **pass^k** — k consecutive successes. Required pass^3 = 100% on critical-path scenarios (malicious PDF active content, Office macro, prompt-injection-in-document, SSRF to cloud metadata, responder-irreversible-attempt) before observe-to-enforce promotion.

Observe-to-enforce promotion gate (item #9) consumes these metrics directly.

Reference: eval-driven development pattern from external review (`arabicapp/everything-claude-code:skills/eval-harness/SKILL.md`).

Purpose: gate observe-to-enforce promotion and future model releases.

### 9. Observe-To-Enforce Promotion Gate

Before any autonomous enforcement expansion:

1. Run the boundary benchmark.
2. Compare shadow decisions against actual decisions.
3. Review false positives and misses.
4. Confirm policy version and action matrix.
5. Require human approval for promotion.
6. Record the promotion decision.

This should become part of Phase 5 or the first observe-to-enforce transition.

### 10. Runaway And Cost Guards

Add explicit guardrails for agentic or model-assisted loops:

- per-event inference budget
- per-tenant daily budget
- repeated failure suppression
- cooldown dedupe for repeated findings
- max action proposals per event
- max tool calls per investigation

## Expected Pushback To Discuss

Likely pushback:

- This could expand scope too much for Phase 0.5 or Phase 1.
- Threat Vector patterns are built for agent runtimes, not our SaaS file/security boundary.
- Too much control-plane design may slow the LLM inference proof.
- Boundary benchmark may belong later, after the first model exists.
- Trust/taint states could add schema complexity before we have enough data.

Suggested response:

These concepts do not need to be built immediately. They should be documented now as guardrails so Phase 0.5 and Phase 1 do not accidentally paint us into a corner. The implementation can be phased.

## Suggested Documentation Changes After Discussion

If approved, update:

1. `docs/smart-security-architecture.md`
   - Add a short "Autonomous Defense Control Plane" section.
   - Add trust/taint labels to evidence-first and deterministic orchestration principles.
   - Clarify that internal adversarial testing is allowed, but customer-facing pentesting services are out of scope.

2. `docs/smart-security-phase-0.5.md`
   - Add non-blocking design constraint: `smart-security-llm` classifies/explains only and cannot execute actions.
   - Add future compatibility note for Security Action Envelope fields.

3. `smart-security/SKILL.md`
   - Add "no direct action execution by LLM" and "tainted evidence cannot authorize enforcement alone."

4. `smart-security/policies/action-matrix.yaml`
   - Confirm reversible-only action catalog.
   - Add placeholder risk tier for proposed responder actions.

5. `smart-security/policies/evidence.yaml`
   - Add memory/evidence states for raw, quarantined, reviewed, promoted, rejected.

6. Future roadmap doc
   - Add Smart Security Boundary Bench as an internal quality gate, not a customer product.

## Recommended Phasing

Phase 0.5:

- Only document LLM isolation and no-direct-action rule.
- Do not build the full action envelope yet.

Phase 1:

- Add evidence trust metadata and decision-log compatibility fields.

Phase 2:

- Expand analyzers and attach trust labels to deterministic findings.

Phase 3:

- Doctrine and Triage Agent consume trust-aware evidence.
- Add output guard for triage narratives.

Phase 4:

- Build Responder Tool Control Plane and deterministic admission pipeline.

Phase 5:

- Build Smart Security Boundary Bench.
- Use it as part of observe-to-enforce promotion.

Phase 6+:

- Extend to egress boundary and cross-tenant threat intelligence with taint controls.

## Summary For Claude

The request is not to pivot Smart Security into pentesting. The request is to add agentic-security control-plane lessons to the already documented autonomous defense roadmap.

The core principle to preserve:

Smart Security should not become an AI agent with broad permissions. It should become a deterministic security control plane where AI assists triage, doctrine, and recommendations, while enforcement remains policy-bound, reversible, auditable, and approval-aware.

## Codex Review Recommendations - 2026-05-10

These recommendations classify each proposed uplift before any merge into the canonical roadmap.

1. **Security Action Envelope** — Land in canonical roadmap now. This is the right durable audit shape for future autonomy, even if only a subset is implemented early.
2. **Deterministic Admission Pipeline** — Land in canonical roadmap now. This preserves the existing rule that code owns orchestration and LLMs fill bounded roles.
3. **Responder Tool Control Plane** — Land in canonical roadmap now. The Responder should propose intents, not execute tools directly.
4. **Trust-Aware Evidence** — Land in canonical roadmap now. Evidence trust and taint labels should be part of the design vocabulary before enforcement expands.
5. **Quarantined Memory And Learning Records** — Defer to Phase 4-5. The principle is sound, but memory-state implementation should wait until learning records are actively promoted or reused.
6. **Brokered LLM Isolation** — Land in canonical roadmap now. `smart-security-llm` should classify and explain only; mutation and policy enforcement stay in the TypeScript service.
7. **Output Guard For Triage Narratives** — Land in canonical roadmap now. Any model-written narrative that reaches logs, UI, or support artifacts needs redaction and evidence anchoring.
8. **Smart Security Boundary Bench** — Defer to Phase 4-5. Mention it in the roadmap now, but do not expand Phase 0.5 or evidence-spine scope to build the full harness.
9. **Observe-To-Enforce Promotion Gate** — Land in canonical roadmap now. This is governance, not optional polish, and it protects tenant-zero users before enforcement.
10. **Runaway And Cost Guards** — Land in canonical roadmap now. Budgets, cooldowns, and max action proposals are required before agentic loops or model-assisted investigations expand.
