import { NextRequest, NextResponse } from "next/server"
import { exchangeGoogleDriveCode } from "@/lib/google-drive"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  if (error || !code || !state) return NextResponse.redirect(new URL("/tools/smart-storage?drive=cancelled", request.url))
  try {
    await exchangeGoogleDriveCode(code, state)
    return NextResponse.redirect(new URL("/tools/smart-storage?drive=connected", request.url))
  } catch {
    return NextResponse.redirect(new URL("/tools/smart-storage?drive=error", request.url))
  }
}
