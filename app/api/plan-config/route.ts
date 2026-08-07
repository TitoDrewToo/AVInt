import { NextResponse } from "next/server"

export async function GET() {
  // TODO Andrew: create the Business product/prices and checkout URL in Creem
  // before setting ENABLE_BUSINESS_PLAN=true in the runtime environment.
  const businessEnabled = process.env.ENABLE_BUSINESS_PLAN === "true"
  return NextResponse.json({
    businessEnabled,
    businessCheckoutUrl: businessEnabled ? (process.env.BUSINESS_CHECKOUT_URL ?? null) : null,
  }, { headers: { "Cache-Control": "no-store" } })
}
