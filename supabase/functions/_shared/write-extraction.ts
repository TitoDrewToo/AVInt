type QueryClient = { from: (table: string) => any }

type WriteExtractionInput = {
  id?: string
  userId: string
  fileId: string
  documentType: string | null
  provider: string | null
  model: string | null
  payload: unknown
  sourceRowCount?: number | null
  attemptNumber: number
}

export async function ensureExtraction(client: QueryClient, input: {
  id?: string
  userId: string
  fileId: string
  attemptNumber: number
}): Promise<{ id: string; created: boolean }> {
  if (input.id) {
    const { data, error } = await client
      .from("extractions")
      .select("id")
      .eq("id", input.id)
      .eq("file_id", input.fileId)
      .eq("user_id", input.userId)
      .maybeSingle()
    if (error) throw new Error(`extraction lookup failed: ${error.message}`)
    if (data?.id) return { id: data.id, created: false }
  }

  const { data: existing, error: existingError } = await client
    .from("extractions")
    .select("id")
    .eq("file_id", input.fileId)
    .eq("attempt_number", input.attemptNumber)
    .eq("user_id", input.userId)
    .maybeSingle()
  if (existingError) throw new Error(`extraction lookup failed: ${existingError.message}`)
  if (existing?.id) return { id: existing.id, created: false }

  const { data, error } = await client
    .from("extractions")
    .insert({
      ...(input.id ? { id: input.id } : {}),
      user_id: input.userId,
      file_id: input.fileId,
      attempt_number: input.attemptNumber,
      status: "processing",
      payload: {},
      source_row_count: 0,
    })
    .select("id")
    .single()
  if (error || !data?.id) throw new Error(`extraction placeholder failed: ${error?.message ?? "id not returned"}`)
  return { id: data.id, created: true }
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
      ...(input.id ? { id: input.id } : {}),
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
