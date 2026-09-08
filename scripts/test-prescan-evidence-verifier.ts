import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import { verifyAdminAuditEvidence, verifyPrescanEvidence, type PrescanEvidenceRow, type SealedEvidenceRow } from "../lib/prescan-evidence-verifier"

function sealed<T extends Omit<SealedEvidenceRow, "canonical_payload" | "event_hash">>(row: T) {
  const canonical_payload = JSON.stringify(row)
  const event_hash = createHash("sha256").update(canonical_payload).digest("hex")
  return { ...row, canonical_payload, event_hash }
}

const first = sealed({ id: "00000000-0000-4000-8000-000000000001", correlation_id: "10000000-0000-4000-8000-000000000001", created_at: "2026-09-08T00:00:00.000Z", previous_event_hash: null })
const second = sealed({ id: "00000000-0000-4000-8000-000000000002", correlation_id: first.correlation_id, created_at: "2026-09-08T00:00:01.000Z", previous_event_hash: first.event_hash })
assert.deepEqual(verifyPrescanEvidence([second, first] as PrescanEvidenceRow[]), {
  valid: true,
  events: 2,
  correlations: 1,
  linked: 1,
  baseline_roots: 1,
  external_predecessors: 0,
})

const auditFirst = sealed({ id: "20000000-0000-4000-8000-000000000001", created_at: "2026-09-08T00:00:00.000Z", previous_event_hash: "a".repeat(64) })
const auditSecond = sealed({ id: "20000000-0000-4000-8000-000000000002", created_at: "2026-09-08T00:00:01.000Z", previous_event_hash: auditFirst.event_hash })
assert.equal(verifyAdminAuditEvidence([auditSecond, auditFirst]).external_predecessors, 1)

assert.throws(() => verifyPrescanEvidence([{ ...second, canonical_payload: "tampered" }, first] as PrescanEvidenceRow[]), /event hash mismatch/)
assert.throws(() => verifyPrescanEvidence([{ ...second, previous_event_hash: "b".repeat(64), canonical_payload: second.canonical_payload }, first] as PrescanEvidenceRow[]), /sealed payload mismatch/)

console.log("prescan evidence verifier: passed")
