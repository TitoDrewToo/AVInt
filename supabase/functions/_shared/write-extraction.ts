type QueryClient = { from: (table: string) => any }

type WriteExtractionInput = {
  userId: string
  fileId: string
  documentType: string | null
  provider: string | null
  model: string | null
  payload: unknown
  sourceRowCount?: number | null
  attemptNumber: number
}

/** Stable per-file slots let concurrent normalization rows upsert without a max+1 race. */
export function attemptNumberForSourceKey(sourceKey: string): number {
  if (sourceKey === "root") return 2
  const rowIndex = Number(sourceKey)
  if (Number.isInteger(rowIndex) && rowIndex >= 0) return rowIndex + 2
  throw new Error(`Unsupported extraction source key: ${sourceKey}`)
}

export async function writeExtraction(client: QueryClient, input: WriteExtractionInput): Promise<string> {
  const { data, error } = await client
    .from("extractions")
    .upsert({
      user_id: input.userId,
      file_id: input.fileId,
      attempt_number: input.attemptNumber,
      provider: input.provider,
      model: input.model,
      status: "succeeded",
      payload: input.payload,
      source_row_count: input.sourceRowCount ?? (Array.isArray(input.payload) ? input.payload.length : 1),
      document_type: input.documentType,
    }, { onConflict: "file_id,attempt_number" })
    .select("id")
    .single()
  if (error || !data?.id) throw new Error(`extraction insert failed: ${error?.message ?? "id not returned"}`)
  return data.id
}
