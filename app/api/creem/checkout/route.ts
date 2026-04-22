import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"

const CREEM_API_BASE =
  process.env.CREEM_TEST_MODE === "true"
    ? "https://test-api.creem.io"
    : "https://api.creem.io"

const ALLOWED_PRODUCT_IDS = new Set([
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

export async function POST(req: NextRequest) {
  try {
    const { product_id, email, success_url } = await req.json()

    if (!product_id) {
      return NextResponse.json({ error: "product_id required" }, { status: 400 })
    }
    if (!ALLOWED_PRODUCT_IDS.has(product_id)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 })
    }

    const body: Record<string, unknown> = {
      product_id,
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
