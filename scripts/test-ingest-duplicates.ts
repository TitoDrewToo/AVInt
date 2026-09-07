import assert from "node:assert/strict"
import { sha256Hex, findExistingFileBySha } from "../lib/ingest-duplicates"
import { buildIngestBatchDescriptor, deriveIngestBatchStatus } from "../lib/ingest-batch-contract"

async function main() {
const userId = "7f6457ff-b7a0-42f5-a0ef-f5fc4eb0e720"
const bytes = new TextEncoder().encode("same document bytes")
const sha256 = await sha256Hex(bytes)
const filters: Record<string, unknown> = {}
const client = {
  from(table: string) {
    assert.equal(table, "files")
    const query = {
      select() { return query },
      eq(field: string, value: unknown) { filters[field] = value; return query },
      neq(field: string, value: unknown) { filters[`not_${field}`] = value; return query },
      order() { return query },
      limit() { return query },
      async maybeSingle() { return { data: { id: "existing-file", filename: "original.csv", created_at: "2026-09-06T00:00:00Z" }, error: null } },
    }
    return query
  },
}
const existing = await findExistingFileBySha(client, userId, sha256)
assert.deepEqual(existing, { id: "existing-file", filename: "original.csv", created_at: "2026-09-06T00:00:00Z" })
assert.equal(filters.user_id, userId)
assert.equal(filters.sha256, sha256)
assert.equal(filters.not_upload_status, "quarantined")

const files = [{ name: "original.csv", mimeType: "text/csv", data: Buffer.from(bytes).toString("base64") }]
assert.notEqual(buildIngestBatchDescriptor(files, false).requestHash, buildIngestBatchDescriptor(files, true).requestHash)
assert.equal(deriveIngestBatchStatus([{ status: "duplicate" }]), "completed")

console.log(JSON.stringify({
  preflight: { userId, sha256, existingFile: existing, extractionRowsCreatedByDuplicatePath: 0 },
  default: "refuse",
  explicitOverride: "allow_duplicate=true",
  batchStatus: "duplicate",
}, null, 2))
}

void main()
