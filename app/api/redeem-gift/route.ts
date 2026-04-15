import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const { code } = body

  if (!code) {
    return NextResponse.json({ error: "Gift code required" }, { status: 400 })
  }

  const authHeader = req.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = authHeader.slice("Bearer ".length)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user?.id || !user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user_id = user.id
  const email = user.email

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
    status:  "pro",
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
