import { NextRequest, NextResponse } from "next/server"

const SMART_SECURITY_URL = process.env.SMART_SECURITY_URL?.replace(/\/+$/, "")
const SMART_SECURITY_API_KEY = process.env.SMART_SECURITY_API_KEY
const SMART_SECURITY_MIDDLEWARE_MODE = process.env.SMART_SECURITY_MIDDLEWARE_MODE ?? "observe"

const PROTECTED_PREFIXES = [
  "/api/chat",
  "/api/redeem-gift",
  "/api/reports",
  "/api/creem/checkout",
  "/api/creem/cancel",
  "/api/delete-account",
  "/api/delete-file",
  "/api/obligations",
  "/tools",
]

function shouldInspect(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  )
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!shouldInspect(pathname) || !SMART_SECURITY_URL || !SMART_SECURITY_API_KEY) {
    return NextResponse.next()
  }

  try {
    const response = await fetch(`${SMART_SECURITY_URL}/v1/decide`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-smart-security-key": SMART_SECURITY_API_KEY,
      },
      body: JSON.stringify({
        app_id: "avintelligence",
        source: "vercel_middleware",
        ip: clientIp(req),
        method: req.method,
        path: pathname,
        user_agent: req.headers.get("user-agent"),
        accept_language: req.headers.get("accept-language"),
        country: req.headers.get("x-vercel-ip-country"),
        metadata: {
          host: req.headers.get("host"),
          referer: req.headers.get("referer"),
        },
      }),
    })

    if (!response.ok) {
      console.error("Smart Security decision failed:", response.status)
      return NextResponse.next()
    }

    const decision = await response.json()
    if (SMART_SECURITY_MIDDLEWARE_MODE !== "enforce") {
      const next = NextResponse.next()
      next.headers.set("x-smart-security-mode", "observe")
      next.headers.set("x-smart-security-decision", String(decision.decision ?? "unknown"))
      return next
    }

    if (decision.decision === "block") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (decision.decision === "rate_limit") {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    if (decision.decision === "challenge") {
      const url = req.nextUrl.clone()
      url.pathname = "/auth/process"
      url.searchParams.set("action", "login")
      url.searchParams.set("next", pathname)
      return NextResponse.redirect(url)
    }
  } catch (error) {
    console.error("Smart Security middleware unavailable:", error instanceof Error ? error.message : String(error))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*", "/tools/:path*"],
}
