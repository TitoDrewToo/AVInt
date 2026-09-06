import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { beginNormalizationBatch, settleNormalizationRow } from "../supabase/functions/_shared/normalization-batch"

type FileState = {
  id: string
  document_type: string | null
  normalization_batch_id: string | null
  normalization_expected: number
  normalization_settled: number
  upload_status: string
}

function fakeClient(file: FileState, failures: { update?: string; rpc?: string } = {}) {
  return {
    from(table: string) {
      assert.equal(table, "files")
      return {
        update(values: Partial<FileState>) {
          return {
            async eq(field: string, value: string) {
              assert.equal(field, "id")
              assert.equal(value, file.id)
              if (failures.update) return { error: { message: failures.update } }
              Object.assign(file, values)
              return { error: null }
            },
          }
        },
      }
    },
    async rpc(name: string, args: { p_file_id: string; p_batch_id: string; p_completed_rows: number }) {
      assert.equal(name, "avint_settle_document_normalization")
      assert.equal(args.p_file_id, file.id)
      assert.equal(args.p_batch_id, file.normalization_batch_id)
      if (failures.rpc) return { data: null, error: { message: failures.rpc } }
      file.normalization_settled += args.p_completed_rows
      if (file.normalization_settled >= file.normalization_expected) file.upload_status = "normalized"
      return { data: { settled: file.upload_status === "normalized", expected: file.normalization_expected, completed: file.normalization_settled }, error: null }
    },
  }
}

async function main() {
  const processSource = readFileSync(new URL("../supabase/functions/process-document/index.ts", import.meta.url), "utf8")
  const beginIndex = processSource.indexOf("await beginNormalizationBatch")
  const firstPersistIndex = processSource.indexOf("await persistDerived")
  assert.ok(beginIndex >= 0 && beginIndex < firstPersistIndex, "normalization_expected must be recorded before the first canonical row write")

  const file: FileState = { id: "fresh-csv", document_type: null, normalization_batch_id: null, normalization_expected: 0, normalization_settled: 0, upload_status: "approved" }
  const client = fakeClient(file)
  console.log("before", JSON.stringify(file))
  await beginNormalizationBatch(client, { fileId: file.id, batchId: "batch-1", expectedRows: 3, documentType: "csv_export" })
  assert.deepEqual(file, { id: "fresh-csv", document_type: "csv_export", normalization_batch_id: "batch-1", normalization_expected: 3, normalization_settled: 0, upload_status: "processing" })
  await settleNormalizationRow(client, file.id, "batch-1")
  await settleNormalizationRow(client, file.id, "batch-1")
  assert.equal(file.upload_status, "processing")
  await settleNormalizationRow(client, file.id, "batch-1")
  assert.equal(file.upload_status, "normalized")
  console.log("after", JSON.stringify(file))

  await assert.rejects(
    beginNormalizationBatch(client, { fileId: file.id, batchId: "batch-2", expectedRows: 0, documentType: "csv_export" }),
    /at least one row/,
  )
  await assert.rejects(
    beginNormalizationBatch(fakeClient(file, { update: "write denied" }), { fileId: file.id, batchId: "batch-2", expectedRows: 1, documentType: "csv_export" }),
    /File normalization state update failed: write denied/,
  )
  await assert.rejects(
    settleNormalizationRow(fakeClient(file, { rpc: "settle denied" }), file.id, "batch-1"),
    /Normalization settlement failed: settle denied/,
  )
}

void main()
