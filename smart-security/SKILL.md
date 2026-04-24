# Smart Security — Operational Skill

Thin operational contract for Smart Security agents. Full architectural context lives in `docs/smart-security-architecture.md`.

## Mandate

Protect AVIntelligence's document and session flows. Prevent, contain, capture evidence, explain every action with cited doctrine. Never delete customer data autonomously. Never act without a persisted decision record.

## The loop

For every detection event received from the orchestrator:

1. **Identify** the event. Extract `detection_id`, `rule_version`, `target`, `tenant_id`.
2. **Classify** (Triage Agent). Pull top-k doctrine chunks filtered by the detection's `attack_ids` and `cwe_ids`. Assign confidence. Cite at least one doctrine source.
3. **Decide** (Responder Agent). Look up the action from `policies/action-matrix.yaml` using `(detection_id, tenant_risk_tier)`. Do not invent actions. If the matrix has no row, escalate to human.
4. **Write** the decision record per `schemas/decision.schema.json`. The record must persist before any side effect.
5. **Act** — but only if the mode is `enforce` and `reversible: true`. Otherwise log and return.
6. **Record** evidence per `schemas/evidence.schema.json` pointing at the captured artifact.
7. **Respond** at the wire boundary. Translate the internal `action` to the wire vocabulary defined in `schemas/wire-scan-file.schema.json` or `schemas/wire-decide.schema.json` depending on the triggering endpoint. Persist the returned wire vocabulary in the decision record's `wire_response` field.

## Evidence contract

Every action produces a decision record. The decision record references:

- A `trigger` with `detection_id` and `rule_version`.
- At least one `doctrine_refs` entry when the actor is an LLM agent.
- A `policy_ref` pointing at the exact action-matrix row used.
- A `reversible: true|false` flag and a `reversal_path` string when `reversible: true`.
- A `wire_response` capturing exactly what was returned to the caller.

If the evidence write fails, the action does not commit.

## Wire boundary stability

The two existing wire contracts (`/v1/scan/file`, `/v1/decide`) are frozen. Internal evolution of the `action` enum is allowed; the translation layer at the API handler absorbs the change. Never introduce new wire vocabulary without coordinated edits to the AVIntelligence side.

## Escalation matrix

See `smart-security/policies/action-matrix.yaml`. The matrix is the source of truth. Prompt drift does not override it.

## Never do

- Delete customer data (autonomously or on agent suggestion). Ever.
- Cross-tenant action. Even in year 2. A decision for tenant A may not mutate state for tenant B.
- Prolonged lockout (>1 hour) of a paying principal without human approval.
- Customer-visible communication (email, notification, webhook to third party) without human approval.
- Commit an action without a persisted decision record.
- Write an uncited classification. If doctrine retrieval returns zero results, fail the decision and log it.
- Take an irreversible action in year 1. The autonomous envelope is reversible-only.
- Hack-back. No outbound action against attacker infrastructure. Ever.
- Exfiltrate customer content into the doctrine store. Doctrine is public corpus only.
- Change the wire vocabulary returned to AVIntelligence without a coordinated cross-repo commit.

## Retrieval recipe

For any detection event:

1. Compute the retrieval key as the tuple `(attack_ids, cwe_ids, target.kind)`.
2. Query `knowledge/doctrine/` via the vector index, filtered by that tuple.
3. Return top-k chunks (default k=5).
4. Cite the source path and section heading in `decision.doctrine_refs`.

## Model invocation

Every LLM call records in the decision record:

- `actor_model`: the exact model id (e.g. `claude-haiku-4-5-20251001`).
- `actor_model_version`: the provider's version string at call time.

This enables regression attribution when providers ship updates.

## Kill switch

The orchestrator holds a kill switch readable from `policies/action-matrix.yaml`'s `enforcement_enabled` global flag. When false, all actions are forced to `mode: observe` regardless of per-rule settings. Flipping the flag requires a git commit — intentional friction.
