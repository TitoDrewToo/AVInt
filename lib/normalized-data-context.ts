import { supabase } from "@/lib/supabase"

export const DASHBOARD_READY_STATUSES = ["normalized", "manual"] as const
export type DashboardReadyStatus = typeof DASHBOARD_READY_STATUSES[number]

export type NormalizedDocumentField = {
  file_id: string
  document_date: string | null
  total_amount: number | null
  gross_income: number | null
  net_income: number | null
  expense_category: string | null
  merchant_domain: string | null
  currency: string | null
  normalization_status: DashboardReadyStatus
  raw_json: unknown
  vendor_normalized?: string | null
  merchant_address_region?: string | null
  is_recurring?: boolean | null
  line_items?: unknown
  files?: { document_type: string | null; filename: string | null; user_id?: string } | Array<{ document_type: string | null; filename: string | null; user_id?: string }>
}

export async function fetchDashboardReadyFields(
  userId: string,
  options: { fileIds?: string[]; dateFrom?: string; dateTo?: string } = {},
) {
  let query = supabase
    .from("document_fields")
    .select("file_id, document_date, total_amount, gross_income, net_income, expense_category, merchant_domain, currency, normalization_status, raw_json, vendor_normalized, merchant_address_region, is_recurring, line_items, files!inner(document_type, filename, user_id)")
    .eq("files.user_id", userId)
    .in("normalization_status", [...DASHBOARD_READY_STATUSES])
    .order("document_date", { ascending: true })

  if (options.fileIds?.length) query = query.in("file_id", options.fileIds)
  if (options.dateFrom) query = query.gte("document_date", options.dateFrom)
  if (options.dateTo) query = query.lte("document_date", options.dateTo)

  return query
}
