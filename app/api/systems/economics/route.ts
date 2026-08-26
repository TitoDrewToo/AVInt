import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

export async function GET(request: NextRequest) {
  if (!(await getSystemAdminUser(bearerToken(request.headers.get("authorization"))))) {
    return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select("created_at, file_id, file_type, file_size_bytes, source_row_count, extracted_row_count, workload_class, operation, provider, model, status, input_tokens, output_tokens, estimated_cost_usd, pricing_version, duration_ms, is_retry, is_fallback, billable_to_user, error_category")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10000)

  if (error) return NextResponse.json({ error: "Could not load AI usage telemetry" }, { status: 500 })

  const rows = events ?? []
  const sum = (key: "input_tokens" | "output_tokens" | "estimated_cost_usd") => rows.reduce((total, row: any) => total + Number(row[key] ?? 0), 0)
  const retries = rows.filter((row: any) => row.is_retry)
  const fallbacks = rows.filter((row: any) => row.is_fallback)
  const failures = rows.filter((row: any) => row.status === "failed")
  const billable = rows.filter((row: any) => row.billable_to_user)
  const files = Object.values(rows.reduce<Record<string, any>>((acc, row: any) => {
    if (!row.file_id) return acc
    acc[row.file_id] ??= { fileId: row.file_id, fileType: row.file_type ?? "unknown", fileSizeBytes: row.file_size_bytes ?? null, workloadClass: row.workload_class, sourceRowCount: row.source_row_count ?? null, extractedRowCount: row.extracted_row_count ?? null }
    return acc
  }, {}))
  const byOperation = Object.values(rows.reduce<Record<string, { operation: string; calls: number; cost: number; retries: number }>>((acc, row: any) => {
    const item = acc[row.operation] ?? { operation: row.operation, calls: 0, cost: 0, retries: 0 }
    item.calls += 1
    item.cost += Number(row.estimated_cost_usd ?? 0)
    if (row.is_retry) item.retries += 1
    acc[row.operation] = item
    return acc
  }, {})).sort((a, b) => b.cost - a.cost)
  const byProvider = Object.values(rows.reduce<Record<string, { provider: string; model: string; calls: number; cost: number }>>((acc, row: any) => {
    const key = `${row.provider}:${row.model}`
    const item = acc[key] ?? { provider: row.provider, model: row.model, calls: 0, cost: 0 }
    item.calls += 1
    item.cost += Number(row.estimated_cost_usd ?? 0)
    acc[key] = item
    return acc
  }, {})).sort((a, b) => b.cost - a.cost)
  const byFile = Object.values(rows.reduce<Record<string, { fileId: string; calls: number; cost: number; retries: number }>>((acc, row: any) => {
    const key = row.file_id ?? "unattributed"
    const item = acc[key] ?? { fileId: key, fileType: row.file_type ?? "unknown", fileSizeBytes: row.file_size_bytes ?? null, sourceRowCount: row.source_row_count ?? null, extractedRowCount: row.extracted_row_count ?? null, calls: 0, cost: 0, retries: 0 }
    item.calls += 1
    item.cost += Number(row.estimated_cost_usd ?? 0)
    if (row.is_retry) item.retries += 1
    acc[key] = item
    return acc
  }, {})).sort((a, b) => b.cost - a.cost).slice(0, 10)
  const byWorkload = Object.values(rows.reduce<Record<string, { workloadClass: string; files: Set<string>; calls: number; cost: number; retries: number; durationMs: number }>>((acc, row: any) => {
    const key = row.workload_class ?? "unknown"
    const item = acc[key] ?? { workloadClass: key, files: new Set<string>(), calls: 0, cost: 0, retries: 0, durationMs: 0 }
    if (row.file_id) item.files.add(row.file_id)
    item.calls += 1
    item.cost += Number(row.estimated_cost_usd ?? 0)
    item.durationMs += Number(row.duration_ms ?? 0)
    if (row.is_retry) item.retries += 1
    acc[key] = item
    return acc
  }, {})).map((item) => ({ workloadClass: item.workloadClass, files: item.files.size, calls: item.calls, cost: item.cost, retries: item.retries, averageCostPerFile: item.files.size ? item.cost / item.files.size : 0, averageDurationMs: item.calls ? item.durationMs / item.calls : 0 })).sort((a, b) => b.cost - a.cost)
  const sizeBuckets = [
    { label: "< 100 KB", max: 100 * 1024 },
    { label: "100 KB–1 MB", max: 1024 * 1024 },
    { label: "1–10 MB", max: 10 * 1024 * 1024 },
    { label: "10–60 MB", max: 60 * 1024 * 1024 },
  ]
  const bySize = sizeBuckets.map((bucket, index) => {
    const min = index === 0 ? 0 : sizeBuckets[index - 1].max
    const matching = files.filter((file: any) => file.fileSizeBytes != null && file.fileSizeBytes >= min && file.fileSizeBytes < bucket.max)
    return { label: bucket.label, files: matching.length }
  })

  return NextResponse.json({
    windowDays: 30,
    eventCount: rows.length,
    totals: {
      calls: rows.length,
      inputTokens: sum("input_tokens"),
      outputTokens: sum("output_tokens"),
      internalCostUsd: sum("estimated_cost_usd"),
      customerBillableCostUsd: billable.reduce((total, row: any) => total + Number(row.estimated_cost_usd ?? 0), 0),
      retryCostUsd: retries.reduce((total, row: any) => total + Number(row.estimated_cost_usd ?? 0), 0),
      retries: retries.length,
      fallbacks: fallbacks.length,
      failures: failures.length,
    },
    byOperation,
    byProvider,
    byWorkload,
    bySize,
    byFile,
    recent: rows.slice(0, 20),
  }, { headers: { "Cache-Control": "no-store" } })
}
