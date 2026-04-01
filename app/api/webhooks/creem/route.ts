import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

// Product IDs — must match what is set up in Creem dashboard
const PRODUCT_MAP: Record<string, { status: string; plan: string }> = {
  "prod_4KtNZA5eQ3LZ83nom02qsh": { status: "day_pass",  plan: "day_pass" },
  "prod_6OwfR90bY2FIET4R8qbaop": { status: "pro",       plan: "monthly"  },
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function verifySignature(payload: string, secret: string, signature: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin()
  const rawBody = await req.text()
  const signature = req.headers.get("creem-signature") ?? ""
  const secret = process.env.CREEM_WEBHOOK_SECRET ?? ""

  if (!verifySignature(rawBody, secret, signature)) {
    console.error("Creem webhook signature verification failed")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const eventType: string = payload?.eventType ?? ""
  const obj = payload?.object

  console.log("Creem webhook received:", eventType)

  if (!obj) {
    return NextResponse.json({ error: "No object in payload" }, { status: 400 })
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  // Resolve user_id from email
  const resolveUserId = async (email: string): Promise<string | null> => {
    try {
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers()
      return users?.find((u) => u.email === email)?.id ?? null
    } catch {
      return null
    }
  }

  // Upsert into subscriptions table
  const upsertSubscription = async (fields: Record<string, unknown>, userId: string | null) => {
    const email = fields.email as string
    if (userId) {
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .single()

      if (existing) {
        await supabaseAdmin.from("subscriptions").update({ ...fields, updated_at: new Date().toISOString() }).eq("user_id", userId)
      } else {
        await supabaseAdmin.from("subscriptions").insert({ ...fields, user_id: userId, updated_at: new Date().toISOString() })
      }
    } else {
      // No user account yet — insert by email, link later
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("email", email)
        .single()

      if (existing) {
        await supabaseAdmin.from("subscriptions").update({ ...fields, updated_at: new Date().toISOString() }).eq("email", email)
      } else {
        await supabaseAdmin.from("subscriptions").insert({ ...fields, updated_at: new Date().toISOString() })
      }
    }
  }

  try {

    // ── checkout.completed ────────────────────────────────────────────────────
    // Fires for both one-time (day pass) and subscription first payments
    if (eventType === "checkout.completed") {
      const email: string = obj.customer?.email ?? ""
      const productId: string = obj.product?.id ?? ""
      const orderId: string = obj.order?.id ?? ""
      const subscriptionId: string = obj.subscription?.id ?? ""
      const periodEnd: string | null = obj.subscription?.current_period_end_date ?? null
      const customerId: string = obj.customer?.id ?? ""
      const productName: string = obj.product?.name ?? ""

      console.log("checkout.completed — email:", email, "product:", productId)

      const mapping = PRODUCT_MAP[productId]
      if (!mapping) {
        console.warn("Unknown product ID:", productId)
        return NextResponse.json({ received: true })
      }

      const { status, plan } = mapping

      // Day pass: set 24h expiry
      let resolvedPeriodEnd = periodEnd
      if (plan === "day_pass" && !resolvedPeriodEnd) {
        const expires = new Date()
        expires.setHours(expires.getHours() + 24)
        resolvedPeriodEnd = expires.toISOString()
      }

      const userId = await resolveUserId(email)

      await upsertSubscription({
        email,
        product_name:                    productName,
        variant_id:                      productId,
        lemonsqueezy_customer_id:        customerId,
        lemonsqueezy_subscription_id:    subscriptionId,
        lemonsqueezy_order_id:           orderId,
        status,
        plan,
        current_period_end:              resolvedPeriodEnd,
      }, userId)

      try { await supabaseAdmin.rpc("increment_user_counter") } catch (e) { console.warn("rpc error:", e) }
      console.log("checkout.completed processed for:", email)
    }

    // ── subscription.active / subscription.paid ───────────────────────────────
    // Fires when a subscription is created (active) or a recurring payment succeeds (paid)
    if (["subscription.active", "subscription.paid"].includes(eventType)) {
      const email: string = obj.customer?.email ?? ""
      const productId: string = obj.product?.id ?? ""
      const subscriptionId: string = obj.id ?? ""
      const periodEnd: string | null = obj.current_period_end_date ?? null
      const customerId: string = obj.customer?.id ?? ""
      const productName: string = obj.product?.name ?? ""

      console.log(eventType, "— email:", email, "product:", productId)

      const mapping = PRODUCT_MAP[productId]
      if (!mapping) {
        console.warn("Unknown product ID:", productId)
        return NextResponse.json({ received: true })
      }

      const userId = await resolveUserId(email)

      await upsertSubscription({
        email,
        product_name:                    productName,
        variant_id:                      productId,
        lemonsqueezy_customer_id:        customerId,
        lemonsqueezy_subscription_id:    subscriptionId,
        lemonsqueezy_order_id:           "",
        status:                          mapping.status,
        plan:                            mapping.plan,
        current_period_end:              periodEnd,
      }, userId)

      if (eventType === "subscription.active") {
        try { await supabaseAdmin.rpc("increment_user_counter") } catch (e) { console.warn("rpc error:", e) }
      }
      console.log(eventType, "processed for:", email)
    }

    // ── subscription.canceled / subscription.expired ──────────────────────────
    if (["subscription.canceled", "subscription.expired"].includes(eventType)) {
      const subscriptionId: string = obj.id ?? ""
      console.log(eventType, "— sub:", subscriptionId)

      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("lemonsqueezy_subscription_id", subscriptionId)

      console.log(eventType, "processed for sub:", subscriptionId)
    }

    // ── refund.created ────────────────────────────────────────────────────────
    if (eventType === "refund.created") {
      const orderId: string = typeof obj.order === "string" ? obj.order : (obj.order?.id ?? "")
      console.log("refund.created — order:", orderId)

      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "free", plan: null, current_period_end: null, updated_at: new Date().toISOString() })
        .eq("lemonsqueezy_order_id", orderId)

      console.log("refund.created processed for order:", orderId)
    }

    // ── Retroactively link user_id if not yet linked ──────────────────────────
    const emailForLink: string =
      obj.customer?.email ?? obj.email ?? ""
    if (emailForLink) {
      const userId = await resolveUserId(emailForLink)
      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ user_id: userId })
          .eq("email", emailForLink)
          .is("user_id", null)
      }
    }

    return NextResponse.json({ received: true })

  } catch (err: any) {
    console.error("Creem webhook processing error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
