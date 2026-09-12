import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@supabase/supabase-js"

import { serverError } from "@/lib/api-error"
import { CREEM_PRODUCTS } from "@/lib/creem-products"
import { buildCreemEffect } from "@/lib/creem-effect"

// Creem is the active payment provider. Some subscription/gift_codes columns
// retain legacy lemonsqueezy_* names for schema compatibility only.

// Product IDs come from env vars so test→prod is a config change, not a deploy
function getProductMap(): Record<string, { status: string; plan: string; isGiftCode?: boolean }> {
  const map: Record<string, { status: string; plan: string; isGiftCode?: boolean }> = {}
  const dayPassId    = process.env.CREEM_PRODUCT_DAY_PASS_ID ?? CREEM_PRODUCTS["day-pass"].productId
  const proMonthlyId = process.env.CREEM_PRODUCT_PRO_MONTHLY_ID ?? CREEM_PRODUCTS["pro-monthly"].productId
  const proAnnualId  = process.env.CREEM_PRODUCT_PRO_ANNUAL_ID ?? CREEM_PRODUCTS["pro-annual"].productId
  const giftCodeId   = process.env.CREEM_PRODUCT_GIFT_CODE_ID ?? CREEM_PRODUCTS["gift-codes"].productId
  if (dayPassId)    map[dayPassId]    = { status: "day_pass",  plan: "day_pass" }
  if (proMonthlyId) map[proMonthlyId] = { status: "pro",       plan: "monthly"  }
  if (proAnnualId)  map[proAnnualId]  = { status: "pro",       plan: "annual"   }
  if (giftCodeId)   map[giftCodeId]   = { status: "gift_code", plan: "monthly", isGiftCode: true }
  return map
}

function firmSeatProductId() {
  return process.env.CREEM_FIRM_SEAT_PRODUCT_ID ?? ""
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
  const rawBody = await req.text()
  if (!verifySignature(rawBody, process.env.CREEM_WEBHOOK_SECRET ?? "", req.headers.get("creem-signature") ?? "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  let payload: any
  try { payload = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const eventId = typeof payload?.id === "string" ? payload.id.trim() : ""
  const eventType = typeof payload?.eventType === "string" ? payload.eventType.trim() : ""
  if (!eventId || !eventType || !payload?.object) {
    return NextResponse.json({ error: "Missing event identity or object" }, { status: 400 })
  }
  try {
    const effect = buildCreemEffect(eventType, payload.object, {
      products: getProductMap(), firmProductId: firmSeatProductId(), giftCode: generateGiftCode,
    })
    // No writes or entitlement effects outside this atomic database transaction.
    // A lost HTTP response is safe: a committed event is deduplicated on retry.
    const { data, error } = await getSupabaseAdmin().rpc("avint_apply_creem_event", {
      p_event_id: eventId, p_event_type: eventType, p_effect: effect,
    })
    if (error || data?.ok !== true) {
      // PostgreSQL details can contain customer values; log only its code/stage.
      return serverError(new Error(`Atomic payment effect failed (${error?.code ?? "invalid_result"})`), { route: "webhooks/creem", stage: "apply_event" })
    }
    return NextResponse.json({ received: true, duplicate: data.duplicate === true || data.duplicate_effect === true })
  } catch (error) {
    return serverError(error, { route: "webhooks/creem", stage: "build_effect" })
  }
}
