import assert from "node:assert/strict"
import { createHash } from "node:crypto"

export type SealedEvidenceRow = {
  id: string
  created_at: string
  previous_event_hash: string | null
  canonical_payload: string
  event_hash: string
  [key: string]: unknown
}

export type PrescanEvidenceRow = SealedEvidenceRow & { correlation_id: string }

function verifyRowHashes(rows: SealedEvidenceRow[]) {
  const ids = new Set<string>()
  for (const event of rows) {
    assert.equal(typeof event.id, "string")
    assert.equal(typeof event.canonical_payload, "string")
    assert.match(event.event_hash, /^[0-9a-f]{64}$/)
    assert.equal(ids.has(event.id), false, `duplicate event id ${event.id}`)
    ids.add(event.id)
    const computed = createHash("sha256").update(event.canonical_payload, "utf8").digest("hex")
    assert.equal(event.event_hash, computed, `event hash mismatch for ${event.id}`)
    const visiblePayload = Object.fromEntries(Object.entries(event).filter(([key]) => key !== "canonical_payload" && key !== "event_hash"))
    assert.deepEqual(JSON.parse(event.canonical_payload), visiblePayload, `sealed payload mismatch for ${event.id}`)
  }
}

function verifyOrderedChain(rows: SealedEvidenceRow[]) {
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  let previous: string | null = null
  let linked = 0
  let baselineRoots = 0
  let externalPredecessors = 0
  for (const [index, event] of rows.entries()) {
    if (index === 0 && event.previous_event_hash !== null) {
      externalPredecessors += 1
    } else if (event.previous_event_hash === null) {
      baselineRoots += 1
    } else {
      assert.equal(event.previous_event_hash, previous, `chain break before ${event.id}`)
      linked += 1
    }
    previous = event.event_hash
  }
  return { linked, baselineRoots, externalPredecessors }
}

export function verifyPrescanEvidence(rows: PrescanEvidenceRow[]) {
  verifyRowHashes(rows)
  const groups = new Map<string, PrescanEvidenceRow[]>()
  for (const event of rows) {
    assert.equal(typeof event.correlation_id, "string")
    const group = groups.get(event.correlation_id) ?? []
    group.push(event)
    groups.set(event.correlation_id, group)
  }
  let linked = 0
  let baselineRoots = 0
  let externalPredecessors = 0
  for (const group of groups.values()) {
    const result = verifyOrderedChain(group)
    linked += result.linked
    baselineRoots += result.baselineRoots
    externalPredecessors += result.externalPredecessors
  }
  return { valid: true as const, events: rows.length, correlations: groups.size, linked, baseline_roots: baselineRoots, external_predecessors: externalPredecessors }
}

export function verifyAdminAuditEvidence(rows: SealedEvidenceRow[]) {
  verifyRowHashes(rows)
  const result = verifyOrderedChain(rows)
  return { valid: true as const, events: rows.length, linked: result.linked, baseline_roots: result.baselineRoots, external_predecessors: result.externalPredecessors }
}
