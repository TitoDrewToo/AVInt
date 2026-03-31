import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const { code, user_id, email } = body

  if (!code || !user_id || !email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const normalizedCode = String(code).trim().toUpperCase()

  // 1. Look up the gift code
  const { data: giftCode, error: lookupError } = await supabaseAdmin
    .from("gift_codes")
    .select("*")
    .eq("code", normalizedCode)
    .single()

  if (lookupError || !giftCode) {
    return NextResponse.json({ error: "Invalid gift code" }, { status: 404 })
  }

  if (giftCode.status === "redeemed") {
    return NextResponse.json({ error: "This gift code has already been redeemed" }, { status: 409 })
  }

  if (giftCode.expires_at && new Date(giftCode.expires_at) < new Date()) {
    return NextResponse.json({ error: "This gift code has expired" }, { status: 410 })
  }

  const now = new Date().toISOString()

  // 2. Mark code as redeemed
  const { error: redeemError } = await supabaseAdmin
    .from("gift_codes")
    .update({
      status:              "redeemed",
      redeemed_by_user_id: user_id,
      redeemed_at:         now,
    })
    .eq("id", giftCode.id)

  if (redeemError) {
    console.error("Gift code redeem error:", redeemError.message)
    return NextResponse.json({ error: "Failed to redeem code" }, { status: 500 })
  }

  // 3. Upsert subscription for the recipient
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("user_id", user_id)
    .single()

  const subPayload = {
    user_id,
    email,
    status:  "gift_code",
    plan:    giftCode.plan ?? "monthly",
    updated_at: now,
  }

  if (existing) {
    await supabaseAdmin
      .from("subscriptions")
      .update(subPayload)
      .eq("user_id", user_id)
  } else {
    await supabaseAdmin
      .from("subscriptions")
      .insert(subPayload)
  }

  console.log("Gift code redeemed:", normalizedCode, "by", email)

  return NextResponse.json({ success: true, plan: giftCode.plan ?? "monthly" })
}
