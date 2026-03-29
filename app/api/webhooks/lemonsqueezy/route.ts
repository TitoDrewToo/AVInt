import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret)
  const digest = hmac.update(payload).digest("hex")
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-signature") ?? ""
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? ""

  // Verify signature
  if (!verifySignature(rawBody, signature, secret)) {
    console.error("Webhook signature verification failed")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventName = payload?.meta?.event_name
  const data = payload?.data?.attributes
  const meta = payload?.meta?.custom_data

  console.log("LemonSqueezy webhook received:", eventName)
  console.log("Customer email:", data?.user_email)
  console.log("Product name:", data?.product_name ?? data?.first_order_item?.product_name)
  console.log("Status:", data?.status)

  if (!data) {
    return NextResponse.json({ error: "No data in payload" }, { status: 400 })
  }

  // Extract fields
  const email = data.user_email ?? data.email ?? ""
  const productName = data.product_name ?? data.first_order_item?.product_name ?? ""
  const variantId = String(data.variant_id ?? data.first_order_item?.variant_id ?? "")
  const lsCustomerId = String(data.customer_id ?? "")
  const lsSubscriptionId = String(payload?.data?.id ?? "")
  const status = data.status ?? "active"
  const currentPeriodEnd = data.renews_at ?? data.ends_at ?? null

  console.log("Parsed — email:", email, "product:", productName, "variant:", variantId, "status:", status)

  // Map to internal status
  let internalStatus = "free"
  if (["active", "on_trial"].includes(status)) {
    internalStatus = variantId.includes("day") || productName.toLowerCase().includes("day") ? "day_pass" : "pro"
  } else if (["cancelled", "expired", "past_due", "unpaid", "paused"].includes(status)) {
    internalStatus = "cancelled"
  }

  // Determine plan
  let plan = "monthly"
  if (productName.toLowerCase().includes("annual") || productName.toLowerCase().includes("yearly")) plan = "annual"
  if (productName.toLowerCase().includes("day")) plan = "day_pass"
  if (productName.toLowerCase().includes("gift")) plan = "gift_code"

  try {
    if (eventName === "order_created") {
      // For one-time purchases (day pass, gift codes)
      await supabaseAdmin.from("subscriptions").upsert({
        email,
        product_name: productName,
        variant_id: variantId,
        lemonsqueezy_customer_id: lsCustomerId,
        lemonsqueezy_subscription_id: lsSubscriptionId,
        status: internalStatus,
        plan,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: "email" })

      // Increment user counter
      await supabaseAdmin.rpc("increment_user_counter")

      console.log("order_created processed for:", email)
    }

    if (["subscription_created", "subscription_updated"].includes(eventName)) {
      await supabaseAdmin.from("subscriptions").upsert({
        email,
        product_name: productName,
        variant_id: variantId,
        lemonsqueezy_customer_id: lsCustomerId,
        lemonsqueezy_subscription_id: lsSubscriptionId,
        status: internalStatus,
        plan,
        current_period_end: currentPeriodEnd,
        updated_at: new Date().toISOString(),
      }, { onConflict: "email" })

      if (eventName === "subscription_created") {
        await supabaseAdmin.rpc("increment_user_counter")
      }

      console.log(eventName, "processed for:", email)
    }

    if (["subscription_cancelled", "subscription_expired"].includes(eventName)) {
      await supabaseAdmin.from("subscriptions")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("lemonsqueezy_subscription_id", lsSubscriptionId)

      console.log(eventName, "processed for:", email)
    }

    // Update user_id if we can match by email
    const { data: user } = await supabaseAdmin
      .from("auth.users")
      .select("id")
      .eq("email", email)
      .single()
      .catch(() => ({ data: null }))

    if (user?.id) {
      await supabaseAdmin.from("subscriptions")
        .update({ user_id: user.id })
        .eq("email", email)
    }

    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error("Webhook processing error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
