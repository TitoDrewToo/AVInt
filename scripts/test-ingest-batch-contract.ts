import assert from "node:assert/strict"

import { buildIngestBatchDescriptor, deriveIngestBatchStatus } from "../lib/ingest-batch-contract"

const first = { name: "receipt.png", mimeType: "image/png", data: Buffer.from("first").toString("base64") }
const second = { name: "invoice.pdf", mimeType: "application/pdf", data: Buffer.from("second").toString("base64") }

const original = buildIngestBatchDescriptor([first, second])
const retry = buildIngestBatchDescriptor([first, second])
assert.deepEqual(retry, original, "the same ordered files must produce the same batch descriptor")

const reordered = buildIngestBatchDescriptor([second, first])
assert.notEqual(reordered.requestHash, original.requestHash, "file order is part of the idempotent request contract")

const changed = buildIngestBatchDescriptor([{ ...first, data: Buffer.from("changed").toString("base64") }, second])
assert.notEqual(changed.requestHash, original.requestHash, "changed bytes must not reuse an existing batch")
const changedSource = buildIngestBatchDescriptor([{ ...first, source: { provider: "google_drive" as const, fileId: "different" } }, second])
assert.notEqual(changedSource.requestHash, original.requestHash, "changed source metadata must not reuse an existing batch")
assert.equal(original.items[0].byte_size, 5)
assert.equal(original.items[1].byte_size, 6)

assert.equal(deriveIngestBatchStatus([{ status: "processing" }, { status: "normalized" }]), "processing")
assert.equal(deriveIngestBatchStatus([{ status: "failed" }, { status: "normalized" }]), "partial")
assert.equal(deriveIngestBatchStatus([{ status: "normalized" }, { status: "rejected" }, { status: "saved_at_cap" }]), "completed")

console.log("ingest batch contract: retries are stable, changed requests diverge, and aggregate states are correct")
