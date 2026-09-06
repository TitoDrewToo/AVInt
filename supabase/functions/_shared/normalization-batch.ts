type TableClient = { from: (table: string) => any }
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => any }

export async function beginNormalizationBatch(
  client: TableClient,
  input: { fileId: string; batchId: string; expectedRows: number; documentType: string },
) {
  if (!Number.isInteger(input.expectedRows) || input.expectedRows < 1) {
    throw new Error("A normalization batch must contain at least one row")
  }
  const { error } = await client
    .from("files")
    .update({
      document_type: input.documentType,
      normalization_batch_id: input.batchId,
      normalization_expected: input.expectedRows,
      normalization_settled: 0,
      upload_status: "processing",
    })
    .eq("id", input.fileId)
  if (error) throw new Error(`File normalization state update failed: ${error.message ?? String(error)}`)
}

export async function settleNormalizationRow(client: RpcClient, fileId: string, batchId: string | null | undefined) {
  const { data, error } = await client.rpc("avint_settle_document_normalization", {
    p_file_id: fileId,
    p_batch_id: batchId ?? null,
    p_completed_rows: 1,
  })
  if (error) throw new Error(`Normalization settlement failed: ${error.message ?? String(error)}`)
  return data
}
