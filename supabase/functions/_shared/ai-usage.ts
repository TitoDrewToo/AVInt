export type UsageOperation = "prescan_safety" | "extraction" | "spreadsheet_header_mapping" | "normalization"
export type UsageProvider = "openai" | "anthropic" | "gemini"

type UsageCounts = { inputTokens: number | null; outputTokens: number | null }

const PRICING_VERSION = "2026-08-26-v1"
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "gemini-2.5-flash": { input: 0.30, output: 2.50 },
}

export function usageFromResponse(provider: UsageProvider, data: any): UsageCounts {
  if (provider === "openai") {
    const usage = data?.usage
    return { inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? null, outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? null }
  }
  if (provider === "anthropic") {
    return { inputTokens: data?.usage?.input_tokens ?? null, outputTokens: data?.usage?.output_tokens ?? null }
  }
  return { inputTokens: data?.usageMetadata?.promptTokenCount ?? null, outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null }
}

function estimatedCost(model: string, counts: UsageCounts) {
  const price = PRICES[model]
  if (!price) return 0
  return ((counts.inputTokens ?? 0) * price.input + (counts.outputTokens ?? 0) * price.output) / 1_000_000
}

function errorCategory(error: unknown): string | null {
  if (!error) return null
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes("429")) return "rate_limited"
  if (message.includes("timeout")) return "timeout"
  if (message.includes("parse") || message.includes("json")) return "malformed_output"
  if (message.includes("5") || message.includes("api error") || message.includes("network")) return "provider_error"
  return "request_failed"
}

export async function recordAiUsage(supabase: any, input: {
  userId?: string | null
  fileId?: string | null
  documentFieldId?: string | null
  fileType?: string | null
  fileSizeBytes?: number | null
  sourceRowCount?: number | null
  extractedRowCount?: number | null
  documentType?: string | null
  workloadClass?: "document" | "spreadsheet"
  operation: UsageOperation
  provider: UsageProvider
  model: string
  attemptNumber?: number
  status: "succeeded" | "failed"
  response?: any
  error?: unknown
  isRetry?: boolean
  isFallback?: boolean
  metadata?: Record<string, string | number | boolean | null>
  durationMs?: number | null
}) {
  try {
    const counts = input.response ? usageFromResponse(input.provider, input.response) : { inputTokens: null, outputTokens: null }
    const { error } = await supabase.from("ai_usage_events").insert({
      user_id: input.userId ?? null,
      file_id: input.fileId ?? null,
      document_field_id: input.documentFieldId ?? null,
      file_type: input.fileType ?? null,
      file_size_bytes: input.fileSizeBytes ?? null,
      source_row_count: input.sourceRowCount ?? null,
      extracted_row_count: input.extractedRowCount ?? null,
      document_type: input.documentType ?? null,
      workload_class: input.workloadClass ?? "document",
      operation: input.operation,
      provider: input.provider,
      model: input.model,
      attempt_number: input.attemptNumber ?? 1,
      status: input.status,
      input_tokens: counts.inputTokens,
      output_tokens: counts.outputTokens,
      estimated_cost_usd: estimatedCost(input.model, counts),
      pricing_version: PRICING_VERSION,
      duration_ms: input.durationMs ?? null,
      is_retry: input.isRetry ?? false,
      is_fallback: input.isFallback ?? false,
      // Failed, fallback, and retry attempts are internal cost until pricing
      // explicitly says otherwise. Successful first-pass calls are the only
      // events eligible for a future customer-billing policy.
      billable_to_user: input.status === "succeeded" && !(input.isRetry ?? false) && !(input.isFallback ?? false),
      error_category: errorCategory(input.error),
      metadata: input.metadata ?? {},
    })
    if (error) console.error("AI usage telemetry write failed:", error.message)
  } catch (error) {
    console.error("AI usage telemetry write failed:", error instanceof Error ? error.message : String(error))
  }
}
