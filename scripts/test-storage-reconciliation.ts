import assert from "node:assert/strict"

import { findOrphanedInboxObjects, isReconciliationSafeInboxPath } from "@/lib/storage-reconciliation"

const stale = "2026-08-18T00:00:00.000Z"
const cutoff = new Date("2026-08-19T00:00:00.000Z")
const ownedPath = "11111111-1111-4111-8111-111111111111/_inbox/old.pdf"
const referencedPath = "22222222-2222-4222-8222-222222222222/_inbox/referenced.pdf"

assert.equal(isReconciliationSafeInboxPath(ownedPath), true)
assert.equal(isReconciliationSafeInboxPath("11111111-1111-4111-8111-111111111111/canonical/old.pdf"), false)
assert.equal(isReconciliationSafeInboxPath("not-a-user/_inbox/old.pdf"), false)

const candidates = findOrphanedInboxObjects([
  { name: ownedPath, created_at: stale },
  { name: referencedPath, created_at: stale },
  { name: "33333333-3333-4333-8333-333333333333/_inbox/new.pdf", created_at: "2026-08-19T12:00:00.000Z" },
  { name: "44444444-4444-4444-8444-444444444444/_inbox/unknown.pdf", created_at: null },
], new Set([referencedPath]), cutoff)

assert.deepEqual(candidates.map((candidate) => candidate.name), [ownedPath])
console.log("storage reconciliation tests: 5 passed")
