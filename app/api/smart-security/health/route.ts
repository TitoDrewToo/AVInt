import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const DEFAULT_SMART_SECURITY_URL = "https://smart-security-14720117769.asia-southeast1.run.app"

export async function GET() {
  const baseUrl = (process.env.SMART_SECURITY_URL ?? DEFAULT_SMART_SECURITY_URL).replace(/\/+$/, "")

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      status: "not_configured",
      service: "smart-security",
    })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8_000)
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timer)

    const data = await response.json().catch(() => null)
    return NextResponse.json({
      ok: response.ok && Boolean(data?.ok),
      status: response.ok && data?.ok ? "operational" : "degraded",
      service: "smart-security",
      data,
    }, { status: response.ok ? 200 : 502 })
  } catch {
    return NextResponse.json({
      ok: false,
      status: "unreachable",
      service: "smart-security",
    }, { status: 502 })
  }
}
