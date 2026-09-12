import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://avint-fixture.invalid"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
process.env.CREEM_WEBHOOK_SECRET = "test-webhook-secret"
process.env.CREEM_PRODUCT_PRO_MONTHLY_ID = "fixture-pro"
let calls = 0
let failDatabase = false
let duplicate = false
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  assert.equal(url.origin, "https://avint-fixture.invalid")
  // Error telemetry may be attempted after the deliberate failure. Keep it local.
  if (url.pathname !== "/rest/v1/rpc/avint_apply_creem_event") return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })
  calls++
  const body = JSON.parse(String(init?.body))
  assert.equal(body.p_event_id, "evt_fixture")
  assert.equal(body.p_effect.action, "subscription")
  return new Response(JSON.stringify(failDatabase ? { code: "40001", message: "injected database failure" } : { ok: true, duplicate }), { status: failDatabase ? 500 : 200, headers: { "Content-Type": "application/json" } })
}
async function main() {
  const { POST } = await import("../app/api/webhooks/creem/route")
  const body = JSON.stringify({ id: "evt_fixture", eventType: "checkout.completed", object: { customer: { id: "cus", email: "fixture@example.com" }, product: { id: "fixture-pro" }, order: { id: "ord" }, subscription: { id: "sub", current_period_end_date: "2026-10-12T00:00:00Z" } } })
  const invoke = (signature: string) => POST(new NextRequest("https://avint-fixture.invalid/api/webhooks/creem", { method: "POST", body, headers: { "creem-signature": signature } }))
  assert.equal((await invoke("invalid")).status, 401)
  assert.equal(calls, 0)
  const signature = createHmac("sha256", process.env.CREEM_WEBHOOK_SECRET!).update(body).digest("hex")
  failDatabase = true
  assert.equal((await invoke(signature)).status, 500)
  failDatabase = false
  assert.equal((await invoke(signature)).status, 200)
  duplicate = true
  assert.equal((await (await invoke(signature)).json()).duplicate, true)
  assert.equal(calls, 3)
  console.log("Creem route tests passed: signature gating, failed transaction not acknowledged, retry, duplicate acknowledgement")
}
void main()
