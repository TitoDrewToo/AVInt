import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_CONTEXT_ROWS = 120

export async function buildDashboardAIContext(userId: string) {
  const [{ data: files, error: filesError }, { data: fields, error: fieldsError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", userId),
    supabaseAdmin
      .from("document_fields")
      .select("file_id, document_date, vendor_name, vendor_normalized, total_amount, gross_income, net_income, expense_category, merchant_domain, currency, normalization_status, files!inner(document_type, filename, user_id)")
      .eq("files.user_id", userId)
      .in("normalization_status", ["normalized", "manual"])
      .order("document_date", { ascending: false })
      .limit(MAX_CONTEXT_ROWS),
  ])
  if (filesError) throw new Error(filesError.message)
  if (fieldsError) throw new Error(fieldsError.message)

  const readyRows = fields ?? []
  const typeCounts = new Map<string, number>()
  const currencyCounts = new Map<string, number>()
  for (const row of readyRows as any[]) {
    const file = Array.isArray(row.files) ? row.files[0] : row.files
    const type = file?.document_type ?? "general_document"
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
    if (row.currency) currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1)
  }

  return {
    sourceCount: files?.length ?? 0,
    readyRecordCount: readyRows.length,
    attentionCount: (files ?? []).filter((file: any) => ["processing", "pending_scan", "scanning", "approved"].includes(file.upload_status)).length,
    documentTypes: Object.fromEntries(typeCounts),
    currencies: Object.fromEntries(currencyCounts),
    recentRecords: readyRows.slice(0, 40).map((row: any) => ({
      date: row.document_date,
      vendor: row.vendor_normalized ?? row.vendor_name ?? null,
      type: Array.isArray(row.files) ? row.files[0]?.document_type ?? "general_document" : row.files?.document_type ?? "general_document",
      amount: row.total_amount ?? row.gross_income ?? row.net_income ?? null,
      currency: row.currency ?? null,
      category: row.expense_category ?? null,
      merchantDomain: row.merchant_domain ?? null,
    })),
  }
}
