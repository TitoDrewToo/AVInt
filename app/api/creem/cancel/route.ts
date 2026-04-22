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

    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const token = authHeader.slice("Bearer ".length)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user || user.id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("lemonsqueezy_subscription_id", subscription_id)
      .maybeSingle()

    if (subscriptionError) {
      return serverError(subscriptionError, { route: "creem/cancel", stage: "subscription_lookup", userId: user.id })
    }
    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
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
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "scheduled_cancel", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)

    console.log("Subscription cancellation scheduled for user:", user.id)
    return NextResponse.json({ success: true, canceled_at: data.canceled_at })

  } catch (err) {
    return serverError(err, { route: "creem/cancel", stage: "unhandled" })
  }
}
