import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import { beginNormalizationBatch, NormalizationSettlementError, settleNormalizationRow } from "../supabase/functions/_shared/normalization-batch"

type FileState = {
  id: string
  document_type: string | null
  normalization_batch_id: string | null
  normalization_expected: number | null
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
      if (failures.rpc) return { data: null, error: { message: failures.rpc } }
      if (args.p_batch_id !== file.normalization_batch_id) return { data: { settled: false, reason: "file_or_batch_not_found" }, error: null }
      file.normalization_settled += args.p_completed_rows
      if (file.normalization_batch_id === null) return { data: { settled: false, reason: "batch_not_recorded", expected: file.normalization_expected, settled_rows: file.normalization_settled }, error: null }
      if (file.normalization_expected === null) return { data: { settled: false, reason: "expected_not_recorded", expected: null, settled_rows: file.normalization_settled }, error: null }
      if (file.normalization_expected <= 0) return { data: { settled: false, reason: "expected_not_positive", expected: file.normalization_expected, settled_rows: file.normalization_settled }, error: null }
      if (file.normalization_settled < file.normalization_expected) return { data: { settled: false, reason: "incomplete", expected: file.normalization_expected, settled_rows: file.normalization_settled }, error: null }
      file.upload_status = "normalized"
      return { data: { settled: true, expected: file.normalization_expected, settled_rows: file.normalization_settled }, error: null }
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
  const first = await settleNormalizationRow(client, file.id, "batch-1")
  const second = await settleNormalizationRow(client, file.id, "batch-1")
  assert.deepEqual([first, second], [
    { settled: false, reason: "incomplete", expected: 3, settled_rows: 1 },
    { settled: false, reason: "incomplete", expected: 3, settled_rows: 2 },
  ])
  assert.equal(file.upload_status, "processing")
  const third = await settleNormalizationRow(client, file.id, "batch-1")
  assert.deepEqual(third, { settled: true, expected: 3, settled_rows: 3 })
  assert.equal(file.upload_status, "normalized")
  console.log("settlement sequence", JSON.stringify([first, second, third]))
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

  async function refusalReason(refusedFile: FileState, batchId: string | null) {
    try {
      await settleNormalizationRow(fakeClient(refusedFile), refusedFile.id, batchId)
      assert.fail("Settlement refusal should surface as an error")
    } catch (error) {
      assert.ok(error instanceof NormalizationSettlementError)
      return error.reason
    }
  }

  const batchless: FileState = { ...file, id: "batchless", normalization_batch_id: null, normalization_expected: 1, normalization_settled: 0, upload_status: "processing" }
  const missingExpected: FileState = { ...file, id: "missing-expected", normalization_batch_id: "batch-null", normalization_expected: null, normalization_settled: 0, upload_status: "processing" }
  const unrecorded: FileState = { ...file, id: "unrecorded", normalization_batch_id: "batch-zero", normalization_expected: 0, normalization_settled: 0, upload_status: "processing" }
  assert.equal(await refusalReason(batchless, null), "batch_not_recorded")
  assert.equal(await refusalReason(missingExpected, "batch-null"), "expected_not_recorded")
  const zeroReason = await refusalReason(unrecorded, "batch-zero")
  assert.equal(zeroReason, "expected_not_positive")
  assert.equal(await refusalReason(file, "wrong-batch"), "file_or_batch_not_found")
  assert.equal(unrecorded.upload_status, "processing")
  console.log("expected zero", JSON.stringify({ reason: zeroReason, upload_status: unrecorded.upload_status, extraction_status: "succeeded" }))
}

void main()
