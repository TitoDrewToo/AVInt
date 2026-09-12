import assert from "node:assert/strict"
import { operationsCostWindow } from "../lib/operations-cost-window"

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://avint-fixture.invalid"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
process.env.AVINT_OPERATIONS_USER_IDS = "operator"
let userId = "operator"
let empty = false
let incomplete = false
let databaseCalls = 0
const timestamp = new Date().toISOString()
const tables: Record<string, any[]> = {
  ai_usage_events: Array.from({ length: 1105 }, (_, i) => ({ id: String(i), created_at: timestamp, estimated_cost_usd: i === 1104 ? 0 : 0.01, input_tokens: i === 1104 ? null : 10, output_tokens: i === 1104 ? null : 5 })),
  platform_cost_events: [{ id: "platform", occurred_at: timestamp, estimated_cost_usd: 5 }],
  subscriptions: [{ id: "m", plan: "monthly" }, { id: "a", plan: "annual" }, { id: "unknown", plan: "legacy" }],
}
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  assert.equal(url.origin, "https://avint-fixture.invalid")
  if (url.pathname === "/auth/v1/user") return Response.json({ id: userId, aud: "authenticated", email: "fixture@example.com" })
  const table = url.pathname.split("/").at(-1)!
  assert.ok(tables[table], `Unexpected table ${table}`)
  databaseCalls++
  assert.ok(new Headers(init?.headers).get("prefer")?.includes("count=exact"))
  if (table === "subscriptions") {
    assert.equal(url.searchParams.get("status"), "eq.pro")
    assert.ok(url.searchParams.get("current_period_end")?.startsWith("gt."))
  }
  const offset = Number(url.searchParams.get("offset") ?? 0)
  const limit = Number(url.searchParams.get("limit") ?? 1000)
  const rows = empty ? [] : tables[table]
  const data = incomplete && offset > 0 ? [] : rows.slice(offset, offset + Math.min(limit, 100))
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + data.length - 1}/${rows.length}` } })
}
async function main() {
  const monthEnd = new Date("2026-03-31T23:59:59Z")
  assert.equal(operationsCostWindow("2", monthEnd).since.toISOString(), "2026-02-01T00:00:00.000Z")
  assert.equal(operationsCostWindow("3", new Date("2026-01-31")).since.toISOString(), "2025-11-01T00:00:00.000Z")
  assert.equal(operationsCostWindow("2.8", monthEnd).months, 2)
  assert.equal(operationsCostWindow("bad", monthEnd).months, 3)
  assert.equal(operationsCostWindow("999", monthEnd).months, 12)
  const { GET } = await import("../app/api/systems/operations/costs/route")
  const request = () => new Request("https://avint-fixture.invalid/api/systems/operations/costs?months=3", { headers: { authorization: "Bearer fixture-token" } })
  assert.equal((await GET(new Request("https://avint-fixture.invalid"))).status, 401)
  userId = "outsider"
  assert.equal((await GET(request())).status, 404)
  assert.equal(databaseCalls, 0)
  userId = "operator"
  const response = await GET(request())
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.active_subscriptions, 3)
  assert.ok(Math.abs(result.estimated_monthly_subscription_revenue_usd - (12 + 100 / 12)) < 1e-9)
  assert.equal(result.coverage.unpriced_subscription_plans, 1)
  assert.equal(result.coverage.uncertain_ai_events, 1)
  assert.equal(result.coverage.complete_vendor_spend, false)
  assert.equal(result.months_data.length, 3)
  assert.ok(Math.abs(result.months_data.at(-1).total - 16.04) < 1e-9)
  incomplete = true
  assert.equal((await GET(request())).status, 503)
  incomplete = false
  empty = true
  const emptyResult = await (await GET(request())).json()
  assert.equal(emptyResult.months_data.length, 3)
  assert.equal(emptyResult.months_data.every((row: any) => row.events === 0 && row.total === 0), true)
  assert.equal(emptyResult.estimated_monthly_subscription_revenue_usd, 0)
  console.log("Operations cost tests passed: operator gating, complete reads, UTC boundaries, annual equivalent, coverage, empty/incomplete data")
}
void main()
