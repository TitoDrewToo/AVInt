import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { serverError } from "@/lib/api-error"

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

  const normalizedCode = String(code).trim().toUpperCase()
  const accessEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin.rpc("redeem_gift_code", {
    p_code:           normalizedCode,
    p_user_id:        user.id,
    p_email:          user.email,
    p_access_ends_at: accessEndsAt,
  })

  if (error) {
    return serverError(error, { route: "redeem-gift", stage: "rpc", userId: user.id })
  }

  const result = (data as { result?: string; plan?: string } | null)?.result

  switch (result) {
    case "redeemed":
      console.log("Gift code redeemed:", normalizedCode, "by", user.email)
      return NextResponse.json({ success: true, plan: "gift_code", expires_at: accessEndsAt })
    case "already_redeemed":
      return NextResponse.json({ error: "This gift code has already been redeemed" }, { status: 409 })
    case "expired":
      return NextResponse.json({ error: "This gift code has expired" }, { status: 410 })
    case "invalid":
      return NextResponse.json({ error: "Invalid gift code" }, { status: 404 })
    default:
      return serverError(
        new Error(`Unexpected redeem_gift_code result: ${String(result)}`),
        { route: "redeem-gift", stage: "rpc_result", userId: user.id },
      )
  }
}
