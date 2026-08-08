import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { persistErrorEvent } from "@/lib/error-capture"
import { checkRateLimit } from "@/lib/rate-limit"

const MAX_BODY_BYTES = 32 * 1024
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function stringField(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, maxLength) : null
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 })
    }

    let body: Record<string, unknown>
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload")
      body = parsed as Record<string, unknown>
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    let userId: string | null = null
    if (token) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      userId = user?.id ?? null
    }

    const rateKey = userId ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous"
    if (!(await checkRateLimit("error-capture", rateKey, 60, 30))) {
      return NextResponse.json({ ok: false }, { status: 429 })
    }

    const message = stringField(body.message, 2_000)
    if (!message) return NextResponse.json({ ok: false }, { status: 400 })

    await persistErrorEvent({
      userId,
      tool: stringField(body.tool, 120),
      fn: stringField(body.fn, 160),
      action: stringField(body.action, 160),
      route: stringField(body.route, 500),
      level: body.level === "warn" || body.level === "info" ? body.level : "error",
      message,
      stack: stringField(body.stack, 8_000),
      context: body.context,
      release: stringField(body.release, 120),
      environment: stringField(body.environment, 80),
    })
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch {
    // Error capture is best-effort and must never recurse into itself.
    return NextResponse.json({ ok: true }, { status: 202 })
  }
}
