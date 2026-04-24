# Smart Security — Phase 0 Implementation Spec

**Intended reader**: Codex CLI (or any implementer) executing this spec.
**Reference context**: see `docs/smart-security-architecture.md` first, especially the *Existing baseline* section.

## 1. Scope

Create the `smart-security/` folder structure. Write all JSON Schemas (internal + wire), seed YAML policies, seed detection registry, the SKILL stub, the tenant config, READMEs, and the health endpoint. Commit and push.

## 2. Existing baseline — do not reinvent, do not modify

Smart Security has existing integration points in AVIntelligence. **Leave them alone in phase 0.** They are documented here so Codex understands why certain files are explicitly off-limits and why the wire schemas in §5 capture contracts that already exist.

**Wired integration points (both in observe mode)**:

| File | Line | Call | Wire vocabulary |
|---|---|---|---|
| `supabase/functions/prescan-document/index.ts` | 407 | `POST ${SMART_SECURITY_URL}/v1/scan/file` | `clean / suspicious / infected / scan_error` |
| `proxy.ts` | 38 | `POST ${SMART_SECURITY_URL}/v1/decide` | `allow / block / rate_limit / challenge` |

**Environment variables already in use** (do not rename, do not remove):

- `SMART_SECURITY_URL`
- `SMART_SECURITY_API_KEY`
- `SMART_SECURITY_REQUIRED`
- `SMART_SECURITY_MIDDLEWARE_MODE`

**Wire contracts are frozen in phase 0.** The schemas in §5.5 and §5.6 describe these contracts as-is. Any future wire change requires a coordinated commit touching both sides. Phase 0 does not touch either side.

Full context: see `docs/smart-security-architecture.md` → *Existing baseline* section.

## 3. Explicit non-goals for phase 0

- No container builds.
- No Cloud Run deployment.
- No model API calls.
- **No changes to `supabase/functions/prescan-document/index.ts`.** Phase 1's job.
- **No changes to `proxy.ts`.** Phase 4's job (when `/v1/decide` gets real intelligence).
- No database migrations. (Phase 1 introduces the `decision_log` table.)
- No dependencies added to `package.json`. (All JSON Schemas are static; the health endpoint uses only the Next.js runtime and standard library.)

## 4. Exit criteria

All of these must be true for phase 0 to be considered complete:

- [ ] `smart-security/` folder exists at repo root with the structure in §5.
- [ ] All six JSON Schemas in §6 are written exactly as specified, valid draft-07.
- [ ] `smart-security/SKILL.md` written per §7.
- [ ] `smart-security/config/tenant.ts` exports `TENANT_ID` and `TenantId` type per §8.
- [ ] All three policy YAMLs written per §9.
- [ ] `smart-security/detections/registry.json` written per §10.
- [ ] `smart-security/knowledge/manifest.json` and mapping files written per §11.
- [ ] `smart-security/README.md` written per §12.
- [ ] `smart-security/memory/README.md` and `smart-security/services/*/README.md` written per §13.
- [ ] `app/api/smart-security/health/route.ts` written per §14 and returns the documented shape.
- [ ] `.gitkeep` placeholders present in all otherwise-empty folders.
- [ ] No modifications to `supabase/functions/prescan-document/index.ts` or `proxy.ts`.
- [ ] Commit message exactly: `Smart Security phase 0 — scaffolding + schemas`
- [ ] Pushed to `main`.

## 5. Folder tree to create

```
smart-security/
├── SKILL.md
├── README.md
├── config/
│   └── tenant.ts
├── policies/
│   ├── risk-tiers.yaml
│   ├── action-matrix.yaml
│   └── evidence.yaml
├── detections/
│   ├── registry.json
│   ├── yara/
│   │   └── .gitkeep
│   ├── structural/
│   │   └── .gitkeep
│   ├── behavioral/
│   │   └── .gitkeep
│   └── corpora/
│       └── .gitkeep
├── knowledge/
│   ├── manifest.json
│   ├── mappings/
│   │   ├── attack-to-d3fend.json
│   │   ├── cwe-to-owasp.json
│   │   └── rule-to-attack.json
│   └── playbooks/
│       └── .gitkeep
├── services/
│   ├── analyzer/
│   │   └── README.md
│   ├── responder/
│   │   └── README.md
│   └── ingestor/
│       └── README.md
├── schemas/
│   ├── decision.schema.json
│   ├── incident.schema.json
│   ├── evidence.schema.json
│   ├── detection.schema.json
│   ├── wire-scan-file.schema.json
│   └── wire-decide.schema.json
└── memory/
    └── README.md
```

Plus, in the existing Next.js app tree:

```
app/api/smart-security/health/
└── route.ts
```

The directories `app/api/smart-security/`, `app/tools/smart-security/`, and `app/products/smart-security/` already exist as empty placeholders — leave the tools/products placeholders alone in phase 0.

## 6. JSON Schemas

All six use JSON Schema draft-07 and include `$id` pointing to `https://avintph.com/smart-security/schemas/<name>.schema.json`.

### 6.1 `smart-security/schemas/decision.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/decision.schema.json",
  "title": "SmartSecurityDecision",
  "description": "Internal record written before every autonomous or agent-driven action. Invariant: no action commits until the decision record persists. The `action` enum is Smart Security's INTERNAL vocabulary; the API handlers for /v1/scan/file and /v1/decide translate these to the wire-vocabulary enums in wire-scan-file.schema.json and wire-decide.schema.json respectively. Translation table: allow->clean/allow; allow_with_watch->suspicious/allow; quarantine->suspicious/block; reject->infected/block; revoke_session->n/a/block; rate_limit->n/a/rate_limit; block_ingress->infected/n/a; escalate_human->scan_error/allow.",
  "type": "object",
  "required": [
    "decision_id",
    "tenant_id",
    "created_at",
    "actor",
    "trigger",
    "action",
    "mode",
    "target",
    "policy_ref",
    "reversible"
  ],
  "additionalProperties": false,
  "properties": {
    "decision_id": { "type": "string", "format": "uuid" },
    "tenant_id": { "type": "string", "minLength": 1 },
    "created_at": { "type": "string", "format": "date-time" },
    "actor": {
      "type": "string",
      "enum": [
        "triage-agent",
        "responder-agent",
        "investigator-agent",
        "orchestrator",
        "human"
      ]
    },
    "actor_model": { "type": "string" },
    "actor_model_version": { "type": "string" },
    "trigger": {
      "type": "object",
      "required": ["detection_id", "rule_version"],
      "additionalProperties": false,
      "properties": {
        "detection_id": { "type": "string" },
        "rule_version": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "action": {
      "type": "string",
      "enum": [
        "allow",
        "allow_with_watch",
        "quarantine",
        "reject",
        "revoke_session",
        "rate_limit",
        "block_ingress",
        "escalate_human"
      ]
    },
    "mode": { "type": "string", "enum": ["observe", "enforce"] },
    "target": {
      "type": "object",
      "required": ["kind", "id"],
      "additionalProperties": false,
      "properties": {
        "kind": {
          "type": "string",
          "enum": ["document", "session", "principal", "ip", "hash"]
        },
        "id": { "type": "string" },
        "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
      }
    },
    "policy_ref": { "type": "string" },
    "doctrine_refs": { "type": "array", "items": { "type": "string" } },
    "reversible": { "type": "boolean" },
    "reversal_path": { "type": "string" },
    "human_approval": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object",
          "required": ["approver", "approved_at"],
          "additionalProperties": false,
          "properties": {
            "approver": { "type": "string" },
            "approved_at": { "type": "string", "format": "date-time" },
            "note": { "type": "string" }
          }
        }
      ]
    },
    "evidence_pointer": { "type": "string", "format": "uri" },
    "wire_response": {
      "description": "The wire-vocabulary response actually returned to the caller. Recorded for audit and for regression detection when the translation layer changes.",
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "endpoint": { "type": "string", "enum": ["/v1/scan/file", "/v1/decide"] },
        "decision": { "type": "string" }
      }
    }
  }
}
```

### 6.2 `smart-security/schemas/incident.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/incident.schema.json",
  "title": "SmartSecurityIncident",
  "description": "Rollup of related decisions. One incident may contain multiple decisions across the timeline.",
  "type": "object",
  "required": ["incident_id", "tenant_id", "opened_at", "severity", "status"],
  "additionalProperties": false,
  "properties": {
    "incident_id": { "type": "string", "format": "uuid" },
    "tenant_id": { "type": "string", "minLength": 1 },
    "opened_at": { "type": "string", "format": "date-time" },
    "closed_at": { "type": ["string", "null"], "format": "date-time" },
    "severity": {
      "type": "string",
      "enum": ["info", "low", "medium", "high", "critical"]
    },
    "attack_ids": {
      "type": "array",
      "items": { "type": "string", "pattern": "^T\\d{4}(\\.\\d{3})?$" }
    },
    "decision_ids": {
      "type": "array",
      "items": { "type": "string", "format": "uuid" }
    },
    "timeline": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["at", "event"],
        "additionalProperties": false,
        "properties": {
          "at": { "type": "string", "format": "date-time" },
          "event": { "type": "string" },
          "decision_id": { "type": "string", "format": "uuid" },
          "note": { "type": "string" }
        }
      }
    },
    "review_path": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["open", "contained", "reviewed", "closed"]
    },
    "outcome": {
      "type": "string",
      "enum": [
        "true_positive",
        "false_positive",
        "inconclusive",
        "false_negative_retro"
      ]
    }
  }
}
```

### 6.3 `smart-security/schemas/evidence.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/evidence.schema.json",
  "title": "SmartSecurityEvidence",
  "description": "Artifact capture record. Points to the stored bytes; never contains them inline.",
  "type": "object",
  "required": [
    "evidence_id",
    "tenant_id",
    "sha256",
    "captured_at",
    "kind",
    "storage_uri",
    "retention_class"
  ],
  "additionalProperties": false,
  "properties": {
    "evidence_id": { "type": "string", "format": "uuid" },
    "tenant_id": { "type": "string", "minLength": 1 },
    "sha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
    "captured_at": { "type": "string", "format": "date-time" },
    "kind": {
      "type": "string",
      "enum": ["document", "request", "response", "log", "screenshot"]
    },
    "storage_uri": { "type": "string", "format": "uri" },
    "retention_class": {
      "type": "string",
      "enum": ["short-7d", "standard-90d", "extended-1y", "legal-hold"]
    },
    "redactions": {
      "type": ["object", "null"],
      "additionalProperties": false,
      "properties": {
        "strategy": { "type": "string" },
        "fields": { "type": "array", "items": { "type": "string" } },
        "applied_at": { "type": "string", "format": "date-time" }
      }
    },
    "related_decision_id": { "type": "string", "format": "uuid" }
  }
}
```

### 6.4 `smart-security/schemas/detection.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/detection.schema.json",
  "title": "SmartSecurityDetection",
  "description": "Entry in detections/registry.json. One entry per rule, pointing at the rule implementation and its test corpus.",
  "type": "object",
  "required": [
    "detection_id",
    "version",
    "severity",
    "default_confidence",
    "mode",
    "owner",
    "rule_path"
  ],
  "additionalProperties": false,
  "properties": {
    "detection_id": {
      "type": "string",
      "pattern": "^[a-z0-9]+(\\.[a-z0-9-]+)+$",
      "description": "Stable slug, e.g. pdf.suspicious-marker.launch"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "severity": {
      "type": "string",
      "enum": ["info", "low", "medium", "high", "critical"]
    },
    "default_confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "attack_ids": {
      "type": "array",
      "items": { "type": "string", "pattern": "^T\\d{4}(\\.\\d{3})?$" }
    },
    "cwe_ids": {
      "type": "array",
      "items": { "type": "string", "pattern": "^CWE-\\d+$" }
    },
    "mode": { "type": "string", "enum": ["observe", "enforce"] },
    "owner": { "type": "string" },
    "rule_path": {
      "type": "string",
      "description": "Path relative to smart-security/ to the rule implementation."
    },
    "corpus_path": { "type": "string" },
    "promotion_criteria": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "min_weeks_observe": { "type": "integer", "minimum": 1 },
        "min_precision": { "type": "number", "minimum": 0, "maximum": 1 },
        "min_true_positives": { "type": "integer", "minimum": 1 }
      }
    },
    "description": { "type": "string" }
  }
}
```

### 6.5 `smart-security/schemas/wire-scan-file.schema.json`

Captures the existing contract between `supabase/functions/prescan-document/index.ts` and `POST /v1/scan/file` as it is today. **This is a frozen contract.** Changes require coordinated edits in both repos.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/wire-scan-file.schema.json",
  "title": "WireScanFile",
  "description": "Existing wire contract for POST /v1/scan/file. Captures the request and response shapes as consumed by supabase/functions/prescan-document/index.ts at HEAD. Phase 0 documents this contract; phase 2 implements the handler that satisfies it.",
  "type": "object",
  "definitions": {
    "request": {
      "type": "object",
      "required": ["app_id", "file_id", "storage_path", "signed_url", "mime_type"],
      "additionalProperties": false,
      "properties": {
        "app_id": { "type": "string", "const": "avintelligence" },
        "file_id": { "type": "string" },
        "storage_path": { "type": "string" },
        "signed_url": { "type": "string", "format": "uri" },
        "mime_type": { "type": "string" },
        "filename": { "type": ["string", "null"] }
      }
    },
    "response": {
      "type": "object",
      "required": ["decision"],
      "additionalProperties": true,
      "properties": {
        "decision": {
          "type": "string",
          "enum": ["clean", "suspicious", "infected", "scan_error"]
        },
        "signals": {
          "type": "array",
          "items": { "type": "string" }
        },
        "scanner": {
          "type": "object",
          "additionalProperties": true,
          "properties": {
            "clamav": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "signature": { "type": ["string", "null"] }
              }
            }
          }
        }
      }
    }
  },
  "oneOf": [
    { "$ref": "#/definitions/request" },
    { "$ref": "#/definitions/response" }
  ]
}
```

### 6.6 `smart-security/schemas/wire-decide.schema.json`

Captures the existing contract between `proxy.ts` and `POST /v1/decide` as it is today. **Frozen contract.**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://avintph.com/smart-security/schemas/wire-decide.schema.json",
  "title": "WireDecide",
  "description": "Existing wire contract for POST /v1/decide. Captures the request and response shapes as consumed by proxy.ts at HEAD. Phase 0 documents this contract; phase 4 implements the intelligent handler that satisfies it. In phases 0-3 the service may legitimately return decision:allow for every request.",
  "type": "object",
  "definitions": {
    "request": {
      "type": "object",
      "required": ["app_id", "source", "method", "path"],
      "additionalProperties": true,
      "properties": {
        "app_id": { "type": "string", "const": "avintelligence" },
        "source": { "type": "string", "const": "vercel_middleware" },
        "ip": { "type": ["string", "null"] },
        "method": { "type": "string" },
        "path": { "type": "string" },
        "user_agent": { "type": ["string", "null"] },
        "accept_language": { "type": ["string", "null"] },
        "country": { "type": ["string", "null"] },
        "metadata": {
          "type": "object",
          "additionalProperties": true,
          "properties": {
            "host": { "type": ["string", "null"] },
            "referer": { "type": ["string", "null"] }
          }
        }
      }
    },
    "response": {
      "type": "object",
      "required": ["decision"],
      "additionalProperties": true,
      "properties": {
        "decision": {
          "type": "string",
          "enum": ["allow", "block", "rate_limit", "challenge"]
        }
      }
    }
  },
  "oneOf": [
    { "$ref": "#/definitions/request" },
    { "$ref": "#/definitions/response" }
  ]
}
```

## 7. `smart-security/SKILL.md`

Write exactly this content:

````markdown
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
````

## 8. `smart-security/config/tenant.ts`

Write exactly:

```typescript
/**
 * Smart Security — tenant configuration.
 *
 * Year 1: single tenant. Year 2: per-request resolution.
 * This file is the single point of change for that transition.
 */

export const TENANT_ID = "avint" as const;

export type TenantId = typeof TENANT_ID | string;

export function resolveTenantId(): TenantId {
  return TENANT_ID;
}
```

## 9. Policies

### 9.1 `smart-security/policies/risk-tiers.yaml`

```yaml
# Smart Security — risk tiers.
# Year 1 defines one tier. Year 2 introduces per-tenant configurable tiers.

version: "1.0.0"

tiers:
  internal:
    description: >
      AVIntelligence internal tenant. Year-1 default. Reversible autonomous
      actions allowed; irreversible actions require human approval.
    autonomous_actions_allowed:
      - allow
      - allow_with_watch
      - quarantine
      - rate_limit
      - block_ingress
    actions_requiring_human_approval:
      - revoke_session
      - escalate_human
    actions_forbidden:
      - reject
```

Note: `reject` is forbidden at the `internal` tier in phase 0 because the analyzer service does not yet exist. Phase 2 revisits this.

### 9.2 `smart-security/policies/action-matrix.yaml`

```yaml
# Smart Security — action matrix.
# (detection_id, tier) -> action + mode + reversibility + approver.
#
# This file is the source of truth for autonomous action boundaries.
# Prompt drift does not override entries here.

version: "1.0.0"

# Global kill switch. When false, all rows are forced to mode: observe.
enforcement_enabled: false

rows:
  - detection_id: pdf.suspicious-marker.javascript
    tier: internal
    action: quarantine
    mode: observe
    reversible: true
    reversal_path: "Restore from evidence bucket via admin console."
    approver: null
    notes: >
      Seed rule ported from supabase/functions/prescan-document/index.ts
      suspicious PDF markers. Observe-only until phase 2 introduces the real
      detection pipeline.

  - detection_id: pdf.suspicious-marker.launch
    tier: internal
    action: quarantine
    mode: observe
    reversible: true
    reversal_path: "Restore from evidence bucket via admin console."
    approver: null
    notes: >
      Seed rule ported from supabase/functions/prescan-document/index.ts
      suspicious PDF markers. Observe-only until phase 2 introduces the real
      detection pipeline.
```

### 9.3 `smart-security/policies/evidence.yaml`

```yaml
# Smart Security — evidence retention and redaction policy.

version: "1.0.0"

retention_classes:
  short-7d:
    retain_days: 7
    description: Low-severity incidents, auto-resolved observations.
  standard-90d:
    retain_days: 90
    description: Default for quarantined documents and medium-severity events.
  extended-1y:
    retain_days: 365
    description: High-severity incidents and anything tagged for long review.
  legal-hold:
    retain_days: null
    description: No auto-delete. Only human removal after hold release.

default_class: standard-90d

redaction:
  strategy: structural-only
  description: >
    Year 1 retains raw bytes within the tenant's evidence bucket. Structural
    redaction (removing PII fields from logs before retention) applies only to
    request/response records, never to document artifacts.
  pii_fields_to_redact:
    - authorization
    - cookie
    - x-api-key
    - sb-access-token
    - sb-refresh-token
```

## 10. `smart-security/detections/registry.json`

```json
{
  "$schema_version": "1.0.0",
  "detections": [
    {
      "detection_id": "pdf.suspicious-marker.javascript",
      "version": "1.0.0",
      "severity": "medium",
      "default_confidence": 0.7,
      "attack_ids": ["T1204.002"],
      "cwe_ids": ["CWE-94"],
      "mode": "observe",
      "owner": "smart-security",
      "rule_path": "detections/structural/pdf-javascript.yaml",
      "corpus_path": "detections/corpora/pdf.suspicious-marker.javascript/",
      "promotion_criteria": {
        "min_weeks_observe": 4,
        "min_precision": 0.95,
        "min_true_positives": 10
      },
      "description": "PDF contains /JavaScript or /JS marker. Ported from existing prescan-document suspicious marker list. Full detection implementation lands in phase 2."
    },
    {
      "detection_id": "pdf.suspicious-marker.launch",
      "version": "1.0.0",
      "severity": "high",
      "default_confidence": 0.85,
      "attack_ids": ["T1204.002"],
      "cwe_ids": ["CWE-78"],
      "mode": "observe",
      "owner": "smart-security",
      "rule_path": "detections/structural/pdf-launch.yaml",
      "corpus_path": "detections/corpora/pdf.suspicious-marker.launch/",
      "promotion_criteria": {
        "min_weeks_observe": 4,
        "min_precision": 0.95,
        "min_true_positives": 10
      },
      "description": "PDF contains /Launch action. High-severity because /Launch can execute external commands. Ported from existing prescan-document suspicious marker list. Full detection implementation lands in phase 2."
    }
  ]
}
```

Note: `rule_path` targets do not exist yet. Phase 2 creates them. Phase-0 registry is a declaration of intent.

## 11. Knowledge store scaffolding

### 11.1 `smart-security/knowledge/manifest.json`

```json
{
  "$schema_version": "1.0.0",
  "description": "Pointer manifest for doctrine sources. Chunk text lives in Supabase Storage; this file tracks source identity, hash, and ingestion state. Phase 3 populates it.",
  "sources": []
}
```

### 11.2 `smart-security/knowledge/mappings/attack-to-d3fend.json`

```json
{
  "$schema_version": "1.0.0",
  "description": "MITRE ATT&CK technique -> D3FEND mitigation. Phase 3 populates it.",
  "mappings": {}
}
```

### 11.3 `smart-security/knowledge/mappings/cwe-to-owasp.json`

```json
{
  "$schema_version": "1.0.0",
  "description": "CWE id -> OWASP Top 10 category. Phase 3 populates it.",
  "mappings": {}
}
```

### 11.4 `smart-security/knowledge/mappings/rule-to-attack.json`

```json
{
  "$schema_version": "1.0.0",
  "description": "Local detection_id -> ATT&CK technique. Kept in sync with detections/registry.json. Phase 3 populates it beyond the seed entries.",
  "mappings": {
    "pdf.suspicious-marker.javascript": ["T1204.002"],
    "pdf.suspicious-marker.launch": ["T1204.002"]
  }
}
```

## 12. `smart-security/README.md`

```markdown
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
```

## 13. Service placeholder READMEs and memory README

### 13.1 `smart-security/services/analyzer/README.md`

```markdown
# Analyzer service

**Phase 2 deliverable. Empty in phase 0.**

Cloud Run container bundling YARA-X, qpdf, pdfid, olevba, and clamav. Called by the Smart Security API handler that implements `POST /v1/scan/file`.

See `docs/smart-security-phase-2.md` when it exists.
```

### 13.2 `smart-security/services/responder/README.md`

```markdown
# Responder service

**Phase 4 deliverable. Empty in phase 0.**

Bounded-authority action runner. Executes autonomous actions within the envelope defined in `smart-security/policies/action-matrix.yaml`. Feeds the Smart Security API handler that implements `POST /v1/decide`.

See `docs/smart-security-phase-4.md` when it exists.
```

### 13.3 `smart-security/services/ingestor/README.md`

```markdown
# Doctrine ingestor

**Phase 3 deliverable. Empty in phase 0.**

Scheduled job that fetches public doctrine sources (NIST, CISA, OWASP, MITRE, D3FEND, IETF), hashes, chunks, embeds, and indexes them. Proposes rule-mapping updates as commits.

See `docs/smart-security-phase-3.md` when it exists.
```

### 13.4 `smart-security/memory/README.md`

```markdown
# memory/

Runtime data location. **Nothing in this directory is committed to git.**

- `incidents/<id>/` — per-incident timeline, artifacts, decision.json, review.md.
- `reviews/` — weekly/quarterly postmortems.
- `false-positives/` — tuning evidence, feeds rule suppression.
- `false-negatives/` — missed-attack evidence, feeds rule creation.

Actual storage in year 1: Supabase Postgres + Supabase Storage. This directory exists only as a conceptual anchor and is kept in the tree via this README.
```

## 14. Health endpoint

`app/api/smart-security/health/route.ts` — full content:

```typescript
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TENANT_ID } from "@/smart-security/config/tenant";

const SMART_SECURITY_DIR = join(process.cwd(), "smart-security");

type HealthStatus = "ok" | "degraded" | "down";

type HealthResponse = {
  status: HealthStatus;
  tenant_id: string;
  checked_at: string;
  checks: {
    analyzer_reachable: boolean | null;
    doctrine_manifest_age_hours: number | null;
    last_incident_seconds_ago: number | null;
    detection_registry_version: string | null;
    action_matrix_version: string | null;
    mode_summary: { observe: number; enforce: number } | null;
    schema_versions: {
      decision: string | null;
      incident: string | null;
      evidence: string | null;
      detection: string | null;
      wire_scan_file: string | null;
      wire_decide: string | null;
    };
  };
};

async function readJson<T>(relativePath: string): Promise<T | null> {
  try {
    const buf = await readFile(join(SMART_SECURITY_DIR, relativePath), "utf8");
    return JSON.parse(buf) as T;
  } catch {
    return null;
  }
}

async function readSchemaVersion(name: string): Promise<string | null> {
  const schema = await readJson<{ $id?: string }>(
    `schemas/${name}.schema.json`,
  );
  if (!schema) return null;
  return "1.0.0";
}

async function summarizeDetectionModes(): Promise<
  | { observe: number; enforce: number }
  | null
> {
  type Registry = {
    detections: Array<{ mode: "observe" | "enforce" }>;
  };
  const reg = await readJson<Registry>("detections/registry.json");
  if (!reg) return null;
  return reg.detections.reduce(
    (acc, d) => {
      acc[d.mode] = (acc[d.mode] ?? 0) + 1;
      return acc;
    },
    { observe: 0, enforce: 0 } as { observe: number; enforce: number },
  );
}

export async function GET() {
  const [
    registry,
    modeSummary,
    decisionV,
    incidentV,
    evidenceV,
    detectionV,
    wireScanFileV,
    wireDecideV,
  ] = await Promise.all([
    readJson<{ $schema_version: string }>("detections/registry.json"),
    summarizeDetectionModes(),
    readSchemaVersion("decision"),
    readSchemaVersion("incident"),
    readSchemaVersion("evidence"),
    readSchemaVersion("detection"),
    readSchemaVersion("wire-scan-file"),
    readSchemaVersion("wire-decide"),
  ]);

  const checks: HealthResponse["checks"] = {
    analyzer_reachable: null,
    doctrine_manifest_age_hours: null,
    last_incident_seconds_ago: null,
    detection_registry_version: registry?.$schema_version ?? null,
    action_matrix_version: null,
    mode_summary: modeSummary,
    schema_versions: {
      decision: decisionV,
      incident: incidentV,
      evidence: evidenceV,
      detection: detectionV,
      wire_scan_file: wireScanFileV,
      wire_decide: wireDecideV,
    },
  };

  const requiredSchemas = [
    decisionV,
    incidentV,
    evidenceV,
    detectionV,
    wireScanFileV,
    wireDecideV,
  ];
  const allSchemasPresent = requiredSchemas.every((v) => v !== null);
  const status: HealthStatus = allSchemasPresent ? "ok" : "degraded";

  const body: HealthResponse = {
    status,
    tenant_id: TENANT_ID,
    checked_at: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(body, { status: status === "ok" ? 200 : 503 });
}
```

Notes for the implementer:

- The `@/smart-security/config/tenant` import assumes the repo's TypeScript path aliases already include `@/*` → repo root (confirm against `tsconfig.json`; adjust the import path if the alias differs — do not change the tsconfig).
- The endpoint reads files at request time. This is acceptable for a health check. Do not add caching in phase 0.
- `analyzer_reachable`, `doctrine_manifest_age_hours`, `last_incident_seconds_ago`, `action_matrix_version` are stubbed as `null` in phase 0. Later phases wire them.

## 15. `.gitkeep` placeholders

Add empty `.gitkeep` files in every empty directory so git preserves them:

- `smart-security/detections/yara/.gitkeep`
- `smart-security/detections/structural/.gitkeep`
- `smart-security/detections/behavioral/.gitkeep`
- `smart-security/detections/corpora/.gitkeep`
- `smart-security/knowledge/playbooks/.gitkeep`

## 16. Implementation order

Execute in this order to keep each step individually verifiable:

1. Create the folder tree (empty dirs with `.gitkeep`).
2. Write the six JSON Schemas (§6.1 through §6.6).
3. Write `config/tenant.ts` (§8).
4. Write the three policy YAMLs (§9).
5. Write `detections/registry.json` (§10).
6. Write knowledge manifest and mapping files (§11).
7. Write `SKILL.md` (§7).
8. Write `README.md` (§12), service READMEs (§13.1–13.3), memory README (§13.4).
9. Write the health endpoint (§14).
10. Run `git add smart-security/ app/api/smart-security/health/ docs/smart-security-architecture.md docs/smart-security-phase-0.md`.
11. Commit with the exact message: `Smart Security phase 0 — scaffolding + schemas`.
12. Push to `main`.

## 17. Verification

After implementation, verify by observation only (no separate test suite in phase 0):

- `ls smart-security/` shows the full tree.
- JSON Schemas parse as valid JSON and their `$id` values match the spec.
- Policy YAMLs parse as valid YAML.
- `curl http://localhost:3000/api/smart-security/health` (after `npm run dev`) returns status 200 with `status: "ok"` and the documented shape including `wire_scan_file` and `wire_decide` schema versions.
- `git log -1` shows the exact commit message.
- The commit contains only new files and the two doc writes; no existing files modified.

## 18. What NOT to do in phase 0

- Do not install any npm packages. JSON Schema validation is not required at runtime in phase 0.
- Do not wire the health endpoint into any observability (no Sentry, no analytics).
- Do not pre-populate doctrine chunks, mappings, or corpora. Those are phase-3 work.
- Do not author YARA rules yet. The seed rules in `detections/registry.json` point at rule files that do not exist — this is intentional until phase 2.
- **Do not touch `supabase/functions/prescan-document/index.ts`.** Phase 1's job.
- **Do not touch `proxy.ts`.** Phase 4's job.
- Do not modify any other file in `supabase/`, `app/` (except the new health route), or the repo root.
- Do not add an admin UI. Phase 4+.
- Do not change the wire vocabulary in `schemas/wire-scan-file.schema.json` or `schemas/wire-decide.schema.json` from what is captured in this spec. The contract is frozen.
- Do not open a PR; per the project's git workflow, commit and push directly to main.

## 19. Handoff notes for phase 1

Phase 1 (evidence spine) will:

- Introduce a Supabase table `smart_security_decision_log` matching `decision.schema.json`.
- Introduce a Supabase Storage bucket `smart-security-evidence`.
- Inside the Smart Security service, add a decision-record write around **both** entry points:
  - The `/v1/scan/file` handler (for every file scan result — `clean`, `suspicious`, `infected`, `scan_error`).
  - The `/v1/decide` handler (for every middleware decision — `allow`, `block`, `rate_limit`, `challenge`).
- The AVIntelligence side (`prescan-document`, `proxy.ts`) remains untouched. Decision logging is entirely on the Smart Security side.
- Extend the health endpoint to report `last_incident_seconds_ago` and `action_matrix_version`.

Nothing in phase 0 should block or contradict those moves.
