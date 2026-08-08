import { createClient } from "@supabase/supabase-js"

import { createErrorFingerprint } from "./error-fingerprint"
import { sanitizeErrorContext, sanitizeErrorString } from "./error-sanitize"

export type CapturedError = {
  userId?: string | null
  tool?: string | null
  fn?: string | null
  action?: string | null
  route?: string | null
  level?: "error" | "warn" | "info"
  message: string
  stack?: string | null
  context?: unknown
  release?: string | null
  environment?: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function optionalUuid(value: string | null | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null
}

export async function persistErrorEvent(input: CapturedError): Promise<string | null> {
  try {
    const tool = input.tool ? sanitizeErrorString(input.tool, 120) : null
    const fn = input.fn ? sanitizeErrorString(input.fn, 160) : null
    const action = input.action ? sanitizeErrorString(input.action, 160) : null
    const message = sanitizeErrorString(input.message || "Unknown error") || "Unknown error"
    const client = adminClient()
    if (!client) return null
    const { data, error } = await client.rpc("record_error_event", {
      p_user_id: optionalUuid(input.userId),
      p_tool: tool,
      p_fn: fn,
      p_action: action,
      p_route: input.route ? sanitizeErrorString(input.route, 500) : null,
      p_level: input.level ?? "error",
      p_message: message,
      p_stack: input.stack ? sanitizeErrorString(input.stack, 8_000) : null,
      p_fingerprint: createErrorFingerprint({ tool, fn, action, message }),
      p_context: sanitizeErrorContext(input.context) ?? null,
      p_release: input.release ? sanitizeErrorString(input.release, 120) : null,
      p_environment: input.environment ? sanitizeErrorString(input.environment, 80) : null,
    })
    return error ? null : (typeof data === "string" ? data : null)
  } catch {
    // Observability must never become a second outage or recurse into logging.
    return null
  }
}

export function captureServerError(input: CapturedError): void {
  void persistErrorEvent(input)
}
