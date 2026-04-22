import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

import { logApiError, serverError } from "@/lib/api-error"

// Creem is the active payment provider. Some subscription/gift_codes columns
// retain legacy lemonsqueezy_* names for schema compatibility only.

// Product IDs come from env vars so test→prod is a config change, not a deploy
function getProductMap(): Record<string, { status: string; plan: string; isGiftCode?: boolean }> {
  const map: Record<string, { status: string; plan: string; isGiftCode?: boolean }> = {}
  const dayPassId    = process.env.CREEM_PRODUCT_DAY_PASS_ID
  const proMonthlyId = process.env.CREEM_PRODUCT_PRO_MONTHLY_ID
  const proAnnualId  = process.env.CREEM_PRODUCT_PRO_ANNUAL_ID
  const giftCodeId   = process.env.CREEM_PRODUCT_GIFT_CODE_ID
  if (dayPassId)    map[dayPassId]    = { status: "day_pass",  plan: "day_pass" }
  if (proMonthlyId) map[proMonthlyId] = { status: "pro",       plan: "monthly"  }
  if (proAnnualId)  map[proAnnualId]  = { status: "pro",       plan: "annual"   }
  if (giftCodeId)   map[giftCodeId]   = { status: "gift_code", plan: "monthly", isGiftCode: true }
  return map
}

// Generates a human-readable gift code: AVINT-XXXX-XXXX-XXXX.
// crypto.randomBytes so fallback codes are not predictable when Creem doesn't
// return a license key. Rejection sampling avoids the modulo-bias that would
// leak bits 0-3 of the alphabet (36 does not divide 256 evenly).
function generateGiftCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const out: string[] = []
  while (out.length < 12) {
    for (const b of crypto.randomBytes(16)) {
      if (b < 252) {
        out.push(chars[b % 36])
        if (out.length === 12) break
      }
    }
  }
  return `AVINT-${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8, 12).join("")}`
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function parseHexSignature(signature: string): Buffer | null {
  const trimmed = signature.trim()
  if (!trimmed || trimmed.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(trimmed)) {
    return null
  }
  try {
    return Buffer.from(trimmed, "hex")
  } catch {
    return null
  }
}

function verifySignature(payload: string, secret: string, signature: string): boolean {
  if (!secret) return false

  const expected = crypto.createHmac("sha256", secret).update(payload).digest()
  const provided = parseHexSignature(signature)
  if (!provided || provided.length !== expected.length) return false

  try {
    return crypto.timingSafeEqual(expected, provided)
  } catch {
    return false
  }
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
  const eventId: string = typeof payload?.id === "string" ? payload.id : ""

  console.log("Creem webhook received:", eventType, "id:", eventId || "(none)")

  if (!obj) {
    return NextResponse.json({ error: "No object in payload" }, { status: 400 })
  }

  // Idempotency guard. Creem retries on any non-2xx; without dedup we'd
  // re-run increment_user_counter and re-insert gift codes on every retry.
  // Insert-before-side-effects means a retry of a partially-processed event
  // short-circuits here (acceptable — each branch is largely idempotent, and
  // the alternative of double-counting subscribers is worse). If Creem ever
  // stops including a top-level `id`, fail open rather than drop the event.
  if (eventId) {
    const { error: dedupErr } = await supabaseAdmin
      .from("processed_webhook_events")
      .insert({ provider: "creem", event_id: eventId, event_type: eventType })
    if (dedupErr) {
      if ((dedupErr as { code?: string }).code === "23505") {
        console.log("Creem webhook duplicate ignored:", eventId)
        return NextResponse.json({ received: true, duplicate: true })
      }
      return serverError(dedupErr, { route: "webhooks/creem", stage: "dedup_insert" })
    }
  } else {
    console.warn("Creem webhook missing top-level id; dedup skipped")
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  // Resolve user_id from email via indexed RPC.
  // Prior implementation used auth.admin.listUsers() which capped at ~50 and
  // silently missed anyone past page 1.
  const resolveUserId = async (email: string): Promise<string | null> => {
    if (!email) return null
    const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", { p_email: email })
    if (error) {
      logApiError(error, { route: "webhooks/creem", stage: "resolve_user_id", extra: { email } })
      return null
    }
    return typeof data === "string" ? data : null
  }

  // Upsert into subscriptions table.
  // Concurrency model: Creem delivers webhooks via retries; the user_id branch
  // relies on the partial unique index subscriptions_user_id_unique
  // (migration 20260421_subscriptions_user_id_unique.sql) so a racing
  // duplicate insert resolves via ON CONFLICT rather than creating a second
  // row. The email branch keeps check-then-write because pre-signup rows
  // have user_id = NULL and the partial index excludes them.
  const upsertSubscription = async (fields: Record<string, unknown>, userId: string | null) => {
    const email = fields.email as string
    if (userId) {
      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          { ...fields, user_id: userId, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
    } else {
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

      const mapping = getProductMap()[productId]
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

      if (mapping.isGiftCode) {
        // Gift code purchase — store generated license key in gift_codes table
        // Creem puts the license key at obj.license_key?.key or obj.license_key
        const licenseKey: string =
          obj.license_key?.key ??
          obj.license_key ??
          generateGiftCode() // fallback: generate our own if Creem doesn't include it

        const { error: giftError } = await supabaseAdmin.from("gift_codes").insert({
          code:               licenseKey.trim().toUpperCase(),
          status:             "pending",
          plan:               "monthly",
          purchased_by_email: email,
          lemonsqueezy_order_id: orderId, // reusing column for Creem order ID
        })
        if (giftError) console.error("Gift code insert error:", giftError.message)
        else console.log("Gift code stored:", licenseKey, "for", email)
      } else {
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
        // Only count direct subscribers here — gift code purchases are counted on redemption
        try { await supabaseAdmin.rpc("increment_user_counter") } catch (e) { console.warn("rpc error:", e) }
      }
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

      const mapping = getProductMap()[productId]
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

  } catch (err) {
    return serverError(err, { route: "webhooks/creem", stage: "unhandled" })
  }
}
