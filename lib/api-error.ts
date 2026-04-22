import { NextResponse } from "next/server"

// Central error responder for API routes. Logs the real error server-side
// (Supabase constraint messages, stack frames, PG error codes) while returning
// an opaque payload to the client. Prevents schema / internal detail leakage
// via `{ error: err.message }` patterns.
//
// Use this for 500 responses where the underlying cause should not reach the
// browser. For 4xx responses with deliberate user-facing messages (e.g.
// "Invalid gift code", "Active premium access required"), keep returning the
// explicit message via NextResponse.json — those are part of the contract.

type LogContext = {
  route: string
  userId?: string | null
  stage?: string
  extra?: Record<string, unknown>
}

export function logApiError(err: unknown, ctx: LogContext) {
  const message = err instanceof Error
    ? err.message
    : typeof err === "object" && err !== null
      ? JSON.stringify(err)
      : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    route: ctx.route,
    stage: ctx.stage ?? "unknown",
    user_id: ctx.userId ?? null,
    message,
    stack,
    ...(ctx.extra ?? {}),
  }))
}

// 500 response with logging. Message is always the generic string; callers
// that want a specific client-visible message should use NextResponse.json
// directly with a 4xx status.
export function serverError(err: unknown, ctx: LogContext) {
  logApiError(err, ctx)
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
}
