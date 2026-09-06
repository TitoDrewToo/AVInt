type TableClient = { from: (table: string) => any }
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => any }

export type NormalizationSettlementResult = {
  settled: boolean
  reason?: string
  expected?: number | null
  settled_rows?: number
}

export class NormalizationSettlementError extends Error {
  constructor(
    readonly reason: string,
    readonly result?: NormalizationSettlementResult,
  ) {
    super(`Normalization settlement failed: ${reason}`)
    this.name = "NormalizationSettlementError"
  }
}

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
  if (error) throw new NormalizationSettlementError(error.message ?? String(error))
  if (!data || typeof data !== "object" || typeof data.settled !== "boolean") {
    throw new NormalizationSettlementError("invalid_response")
  }
  const result = data as NormalizationSettlementResult
  if (result.settled || result.reason === "incomplete") return result
  throw new NormalizationSettlementError(result.reason ?? "refusal_without_reason", result)
}
