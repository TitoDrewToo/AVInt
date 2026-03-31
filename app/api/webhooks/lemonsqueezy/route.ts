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

  // Determine plan first
  let plan = "monthly"
  if (productName.toLowerCase().includes("annual") || productName.toLowerCase().includes("yearly")) plan = "annual"
  if (productName.toLowerCase().includes("day")) plan = "day_pass"
  if (productName.toLowerCase().includes("gift")) plan = "gift_code"

  // Map to internal status
  let internalStatus = "free"
  const isOneTimePaid = ["paid", "active", "on_trial"].includes(status) || eventName === "order_created"
  if (isOneTimePaid) {
    if (plan === "day_pass" || productName.toLowerCase().includes("day") || variantId.includes("day")) {
      internalStatus = "day_pass"
    } else if (plan === "gift_code" || productName.toLowerCase().includes("gift")) {
      internalStatus = "gift_code"
    } else {
      internalStatus = "pro"
    }
  } else if (["cancelled", "expired", "past_due", "unpaid", "paused"].includes(status)) {
    internalStatus = "cancelled"
  }

  // For day pass: set current_period_end to 24 hours from now if not provided
  let resolvedPeriodEnd = currentPeriodEnd
  if (plan === "day_pass" && !resolvedPeriodEnd) {
    const expires = new Date()
    expires.setHours(expires.getHours() + 24)
    resolvedPeriodEnd = expires.toISOString()
  }

  // Extract order_id
  const lsOrderId = String(data.order_id ?? payload?.data?.id ?? "")

  // Extract license key — present on gift product orders when License Keys are enabled
  // LemonSqueezy puts license key data in payload.included[] or payload.data.attributes.license_key
  const licenseKeyData = payload?.included?.find((i: any) => i.type === "license-keys")
  const licenseKey: string | null = licenseKeyData?.attributes?.key ?? data?.license_key ?? null
  const licenseKeyId: string | null = licenseKeyData?.id ?? null

  // Resolve user_id from email once — reused across all event handlers
  let userId: string | null = null
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
    userId = users?.find((u) => u.email === email)?.id ?? null
    console.log("Matched user_id:", userId, "for email:", email)
  } catch (e) {
    console.warn("Could not match user:", e)
  }

  try {
    if (eventName === "order_created") {

      // Check if subscription already exists for this user
      if (userId) {
        const { data: existing, error: fetchError } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("user_id", userId)
          .single()

        console.log("Existing subscription:", existing, "fetchError:", fetchError?.message)

        if (existing) {
          const { error: updateError } = await supabaseAdmin
            .from("subscriptions")
            .update({
              email,
              product_name: productName,
              variant_id: variantId,
              lemonsqueezy_customer_id: lsCustomerId,
              lemonsqueezy_subscription_id: lsSubscriptionId,
              lemonsqueezy_order_id: lsOrderId,
              status: internalStatus,
              plan,
              current_period_end: resolvedPeriodEnd,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
          console.log("Update error:", updateError?.message)
        } else {
          const { error: insertError } = await supabaseAdmin
            .from("subscriptions")
            .insert({
              user_id: userId,
              email,
              product_name: productName,
              variant_id: variantId,
              lemonsqueezy_customer_id: lsCustomerId,
              lemonsqueezy_subscription_id: lsSubscriptionId,
              lemonsqueezy_order_id: lsOrderId,
              status: internalStatus,
              plan,
              current_period_end: resolvedPeriodEnd,
              updated_at: new Date().toISOString(),
            })
          console.log("Insert error:", insertError?.message)
        }
      } else {
        // No user account yet — insert by email only
        const { error: insertError } = await supabaseAdmin
          .from("subscriptions")
          .insert({
            email,
            product_name: productName,
            variant_id: variantId,
            lemonsqueezy_customer_id: lsCustomerId,
            lemonsqueezy_subscription_id: lsSubscriptionId,
            lemonsqueezy_order_id: lsOrderId,
            status: internalStatus,
            plan,
            current_period_end: resolvedPeriodEnd,
            updated_at: new Date().toISOString(),
          })
        console.log("Insert (no user) error:", insertError?.message)
      }

      // Store license key if this is a gift code purchase
      if (plan === "gift_code" && licenseKey) {
        const { error: giftError } = await supabaseAdmin
          .from("gift_codes")
          .insert({
            code:                    licenseKey,
            status:                  "pending",
            plan:                    "monthly",
            purchased_by_email:      email,
            lemonsqueezy_order_id:   lsOrderId,
            lemonsqueezy_license_id: licenseKeyId,
          })
        if (giftError) console.error("Gift code insert error:", giftError.message)
        else console.log("Gift code stored:", licenseKey)
      }

      try { await supabaseAdmin.rpc("increment_user_counter") } catch (e) { console.warn("rpc error:", e) }
      console.log("order_created processed for:", email)
    }

    if (["subscription_created", "subscription_updated"].includes(eventName)) {
      if (userId) {
        const { data: existing } = await supabaseAdmin
          .from("subscriptions").select("id").eq("user_id", userId).single()

        if (existing) {
          await supabaseAdmin.from("subscriptions").update({
            email, product_name: productName, variant_id: variantId,
            lemonsqueezy_customer_id: lsCustomerId, lemonsqueezy_subscription_id: lsSubscriptionId,
            lemonsqueezy_order_id: lsOrderId,
            status: internalStatus, plan, current_period_end: resolvedPeriodEnd,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId)
        } else {
          await supabaseAdmin.from("subscriptions").insert({
            user_id: userId, email, product_name: productName, variant_id: variantId,
            lemonsqueezy_customer_id: lsCustomerId, lemonsqueezy_subscription_id: lsSubscriptionId,
            lemonsqueezy_order_id: lsOrderId,
            status: internalStatus, plan, current_period_end: resolvedPeriodEnd,
            updated_at: new Date().toISOString(),
          })
        }
      }

      if (eventName === "subscription_created") {
        try { await supabaseAdmin.rpc("increment_user_counter") } catch (e) { console.warn("rpc error:", e) }
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

    // Retroactively link user_id if we resolved one (covers email-only inserts)
    if (userId) {
      await supabaseAdmin.from("subscriptions")
        .update({ user_id: userId })
        .eq("email", email)
        .is("user_id", null)
    }

    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error("Webhook processing error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
