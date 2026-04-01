import { NextRequest, NextResponse } from "next/server"

const CREEM_API_BASE =
  process.env.CREEM_TEST_MODE === "true"
    ? "https://test-api.creem.io"
    : "https://api.creem.io"

export async function POST(req: NextRequest) {
  try {
    const { product_id, email, success_url } = await req.json()

    if (!product_id) {
      return NextResponse.json({ error: "product_id required" }, { status: 400 })
    }

    const body: Record<string, unknown> = {
      product_id,
      success_url: success_url ?? `${process.env.NEXT_PUBLIC_APP_URL}/purchase/process`,
    }

    if (email) {
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
  } catch (err: any) {
    console.error("Creem checkout error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
