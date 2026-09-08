export type KnownQuarantinedFile = {
  id: string
  scan_reason: string | null
}

export type PrescanSafetyResult = {
  is_processable: boolean
  doc_category: string
  confidence: number
  abuse_flag: boolean
  reason: string
}

const DOCUMENT_CATEGORIES = new Set([
  "receipt", "invoice", "bill", "payslip", "statement", "contract", "tax_form",
  "medical_bill", "insurance_claim", "insurance_document", "payment_record",
  "other_financial", "operational_data", "unrelated",
])

export function parsePrescanSafetyJson(provider: string, rawText: string): PrescanSafetyResult {
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  const objectMatch = stripped.match(/\{[\s\S]*\}/)
  if (!objectMatch) throw new Error(`${provider} safety failed to parse JSON object`)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(objectMatch[0]) as Record<string, unknown>
  } catch {
    throw new Error(`${provider} safety failed to parse JSON`)
  }
  if (
    typeof parsed.is_processable !== "boolean" ||
    typeof parsed.abuse_flag !== "boolean" ||
    typeof parsed.doc_category !== "string" ||
    !DOCUMENT_CATEGORIES.has(parsed.doc_category) ||
    typeof parsed.confidence !== "number" ||
    !Number.isFinite(parsed.confidence) ||
    parsed.confidence < 0 ||
    parsed.confidence > 1 ||
    typeof parsed.reason !== "string" ||
    parsed.reason.length > 500
  ) {
    throw new Error(`${provider} safety failed to parse a valid decision`)
  }
  return parsed as PrescanSafetyResult
}

type FilesClient = {
  // Supabase's PostgREST builder is PromiseLike rather than a native Promise.
  // Keep this narrow helper independent of generated database types.
  from(table: string): any
}

export async function findKnownQuarantinedFile(
  client: FilesClient,
  userId: string,
  sha256: string,
): Promise<KnownQuarantinedFile | null> {
  const { data, error } = await client
    .from("files")
    .select("id, scan_reason")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .eq("upload_status", "quarantined")
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Known-quarantined-hash lookup failed: ${error.message ?? "unknown database error"}`)
  }
  return data as KnownQuarantinedFile | null
}
