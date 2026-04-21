import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { serverError } from "@/lib/api-error"

const CREEM_API_BASE =
  process.env.CREEM_TEST_MODE === "true"
    ? "https://test-api.creem.io"
    : "https://api.creem.io"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const { subscription_id, user_id } = await req.json()

    if (!subscription_id || !user_id) {
      return NextResponse.json({ error: "subscription_id and user_id required" }, { status: 400 })
    }

    // Cancel at end of billing period (not immediate — fair to user)
    const response = await fetch(`${CREEM_API_BASE}/v1/subscriptions/${subscription_id}/cancel`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.CREEM_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "scheduled", onExecute: "cancel" }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Creem cancel failed:", data)
      return NextResponse.json({ error: data.message ?? "Cancellation failed" }, { status: response.status })
    }

    // Mark as scheduled_cancel in our DB — access remains until period end
    const supabaseAdmin = getSupabaseAdmin()
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "scheduled_cancel", updated_at: new Date().toISOString() })
      .eq("user_id", user_id)

    console.log("Subscription cancellation scheduled for user:", user_id)
    return NextResponse.json({ success: true, canceled_at: data.canceled_at })

  } catch (err) {
    return serverError(err, { route: "creem/cancel", stage: "unhandled" })
  }
}
