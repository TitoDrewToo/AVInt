import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { CREEM_PRODUCTS, type CreemPlan } from "@/lib/creem-products"

const CREEM_API_BASE =
  process.env.CREEM_TEST_MODE === "true"
    ? "https://test-api.creem.io"
    : "https://api.creem.io"

const ALLOWED_PRODUCT_IDS = new Set([
  ...Object.values(CREEM_PRODUCTS).map((product) => product.productId),
  process.env.CREEM_PRODUCT_DAY_PASS_ID,
  process.env.CREEM_PRODUCT_PRO_MONTHLY_ID,
  process.env.CREEM_PRODUCT_PRO_ANNUAL_ID,
  process.env.CREEM_PRODUCT_GIFT_CODE_ID,
].filter(Boolean))

function safeSuccessUrl(value: unknown) {
  const fallback = `${process.env.NEXT_PUBLIC_APP_URL}/purchase/process`
  if (typeof value !== "string") return fallback
  try {
    const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin
    const candidate = new URL(value)
    return candidate.origin === appOrigin ? candidate.toString() : fallback
  } catch {
    return fallback
  }
}

function clientKey(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown"
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkRateLimit("checkout", clientKey(req), 60, 20)
    if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

    const { product_id, plan, email, success_url } = await req.json()
    const selectedPlan = typeof plan === "string" && plan in CREEM_PRODUCTS ? plan as CreemPlan : null
    const environmentProductId = selectedPlan === "day-pass"
      ? process.env.CREEM_PRODUCT_DAY_PASS_ID
      : selectedPlan === "gift-codes"
        ? process.env.CREEM_PRODUCT_GIFT_CODE_ID
        : selectedPlan === "pro-monthly"
          ? process.env.CREEM_PRODUCT_PRO_MONTHLY_ID
          : selectedPlan === "pro-annual"
            ? process.env.CREEM_PRODUCT_PRO_ANNUAL_ID
            : undefined
    const resolvedProductId = selectedPlan ? (environmentProductId ?? CREEM_PRODUCTS[selectedPlan].productId) : product_id

    if (!resolvedProductId) {
      return NextResponse.json({ error: "plan or product_id required" }, { status: 400 })
    }
    if (!ALLOWED_PRODUCT_IDS.has(resolvedProductId)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 })
    }

    const fallbackProduct = Object.values(CREEM_PRODUCTS).find((product) => product.productId === resolvedProductId)
    if (!process.env.CREEM_API_KEY && fallbackProduct) return NextResponse.json({ checkout_url: fallbackProduct.paymentUrl })

    const body: Record<string, unknown> = {
      product_id: resolvedProductId,
      success_url: safeSuccessUrl(success_url),
    }

    if (typeof email === "string" && email.includes("@")) {
      body.customer = { email }
    }

    const response = await fetch(`${CREEM_API_BASE}/v1/checkouts`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.CREEM_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Creem checkout creation failed:", data)
      return NextResponse.json(
        { error: data.message ?? "Checkout creation failed" },
        { status: response.status }
      )
    }

    return NextResponse.json({ checkout_url: data.checkout_url })
  } catch (err) {
    return serverError(err, { route: "creem/checkout", stage: "unhandled" })
  }
}
