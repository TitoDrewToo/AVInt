import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { readComplete } from "@/lib/complete-read"
import { operationsCostWindow } from "@/lib/operations-cost-window"

function bearer(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }
function isOperator(userId: string) { return (process.env.AVINT_OPERATIONS_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(userId) }

/** Internal-only operational cost/revenue view; UI is intentionally deferred. */
export async function GET(request: Request) {
  const token = bearer(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(token)
  if (!auth.user || !isOperator(auth.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const url = new URL(request.url)
  const now = new Date()
  const { months, since } = operationsCostWindow(url.searchParams.get("months"), now)
  try {
  const [ai, other, subscriptions] = await Promise.all([
    readComplete((from, to) => supabaseAdmin.from("ai_usage_events").select("id, created_at, estimated_cost_usd, provider, operation, status, input_tokens, output_tokens", { count: "exact" }).gte("created_at", since.toISOString()).lte("created_at", now.toISOString()).order("id").range(from, to)),
    readComplete((from, to) => supabaseAdmin.from("platform_cost_events").select("id, occurred_at, estimated_cost_usd, category, provider", { count: "exact" }).gte("occurred_at", since.toISOString()).lte("occurred_at", now.toISOString()).order("id").range(from, to)),
    readComplete((from, to) => supabaseAdmin.from("subscriptions").select("id, plan, status, current_period_end", { count: "exact" }).eq("status", "pro").gt("current_period_end", now.toISOString()).order("id").range(from, to)),
  ])
  const byMonth = new Map<string, { ai: number; other: number; total: number; events: number }>()
  for (let index = 0; index < months; index++) {
    const month = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + index, 1)).toISOString().slice(0, 7)
    byMonth.set(month, { ai: 0, other: 0, total: 0, events: 0 })
  }
  const add = (date: string, cost: number, kind: "ai" | "other") => {
    const key = date.slice(0, 7); const row = byMonth.get(key) ?? { ai: 0, other: 0, total: 0, events: 0 }
    row[kind] += cost; row.total += cost; row.events += 1; byMonth.set(key, row)
  }
  for (const row of ai ?? []) add(row.created_at, Number(row.estimated_cost_usd ?? 0), "ai")
  for (const row of other ?? []) add(row.occurred_at, Number(row.estimated_cost_usd ?? 0), "other")
  const monthlyRevenue = subscriptions.reduce((sum, row) => sum + (row.plan === "monthly" ? 12 : row.plan === "annual" ? 100 / 12 : 0), 0)
  const uncertainAiEvents = ai.filter(row => row.input_tokens === null || row.output_tokens === null || Number(row.estimated_cost_usd) === 0).length
  return NextResponse.json({ since: since.toISOString(), as_of: now.toISOString(), months, active_subscriptions: subscriptions.length, estimated_monthly_subscription_revenue_usd: monthlyRevenue,
    months_data: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values })),
    coverage: { complete_event_reads: true, complete_vendor_spend: false, uncertain_ai_events: uncertainAiEvents, platform_cost_events: other.length, unpriced_subscription_plans: subscriptions.filter(row => !["monthly", "annual"].includes(row.plan)).length },
    assumptions: { ai_costs: "Recorded estimates only; missing calls and unpriced models are not zero-cost proof", other_costs: "Manually recorded platform estimates, not reconciled vendor invoices", revenue: "Active Pro monthly $12 and annual $100/12 at current list rates; not Creem cash receipts, net revenue, or verified recurring commitments. Excludes discounts, tax, fees, refunds, gifts and firm plans." } })
  } catch {
    return NextResponse.json({ error: "Operational metrics unavailable or incomplete" }, { status: 503 })
  }
}
