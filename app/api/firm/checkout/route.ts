import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { CREEM_FIRM_SEAT_PRODUCT_ID } from "@/lib/firm-partnership"
import { checkRateLimit } from "@/lib/rate-limit"

const CREEM_API_BASE = process.env.CREEM_TEST_MODE === "true" ? "https://test-api.creem.io" : "https://api.creem.io"

function safeSuccessUrl(value: unknown) {
  const fallback = `${process.env.NEXT_PUBLIC_APP_URL}/purchase/process`
  if (typeof value !== "string") return fallback
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin
    const candidate = new URL(value)
    return candidate.origin === origin ? candidate.toString() : fallback
  } catch { return fallback }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  const { data: auth, error: authError } = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null }, error: new Error("missing token") }
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: admin, error: adminError } = await supabaseAdmin.from("firm_admins").select("firm_id").eq("user_id", auth.user.id).maybeSingle()
  if (adminError || !admin) return NextResponse.json({ error: "Firm administrator access required" }, { status: 403 })

  const allowed = await checkRateLimit("checkout", auth.user.id, 60, 10)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const units = typeof body.units === "number" ? body.units : Number(body.units)
  if (!Number.isSafeInteger(units) || units < 1 || units > 1000) return NextResponse.json({ error: "units must be an integer from 1 to 1000" }, { status: 400 })
  if (!CREEM_FIRM_SEAT_PRODUCT_ID || !process.env.CREEM_API_KEY) return NextResponse.json({ error: "Firm seat checkout is not configured" }, { status: 503 })

  const response = await fetch(`${CREEM_API_BASE}/v1/checkouts`, {
    method: "POST",
    headers: { "x-api-key": process.env.CREEM_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: CREEM_FIRM_SEAT_PRODUCT_ID,
      units,
      success_url: safeSuccessUrl(body.success_url),
      customer: { email: auth.user.email },
      metadata: { firm_id: admin.firm_id, units: String(units) },
    }),
  })
  const data = await response.json()
  if (!response.ok) return NextResponse.json({ error: data.message ?? "Checkout creation failed" }, { status: response.status })
  return NextResponse.json({ checkout_url: data.checkout_url })
}
