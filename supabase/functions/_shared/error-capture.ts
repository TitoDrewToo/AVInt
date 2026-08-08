import { createClient } from "./deps.ts"
import { createErrorFingerprint } from "./error-fingerprint.ts"
import { sanitizeErrorContext, sanitizeErrorString } from "./error-sanitize.ts"

type CapturedFunctionError = {
  userId?: string | null
  tool?: string | null
  fn?: string | null
  action?: string | null
  route?: string | null
  message: string
  stack?: string | null
  context?: unknown
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function captureFunctionError(input: CapturedFunctionError): void {
  void (async () => {
    try {
      const url = Deno.env.get("SUPABASE_URL")
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      if (!url || !key) return
      const tool = input.tool ? sanitizeErrorString(input.tool, 120) : null
      const fn = input.fn ? sanitizeErrorString(input.fn, 160) : null
      const action = input.action ? sanitizeErrorString(input.action, 160) : null
      const message = sanitizeErrorString(input.message || "Unknown error") || "Unknown error"
      const client = createClient(url, key)
      await client.rpc("record_error_event", {
        p_user_id: input.userId && UUID_PATTERN.test(input.userId) ? input.userId : null,
        p_tool: tool,
        p_fn: fn,
        p_action: action,
        p_route: input.route ? sanitizeErrorString(input.route, 500) : null,
        p_level: "error",
        p_message: message,
        p_stack: input.stack ? sanitizeErrorString(input.stack, 8_000) : null,
        p_fingerprint: createErrorFingerprint({ tool, fn, action, message }),
        p_context: sanitizeErrorContext(input.context) ?? null,
        p_release: null,
        p_environment: Deno.env.get("ENVIRONMENT") ?? null,
      })
    } catch {
      // Never log from this failure path: that would recurse through logError.
    }
  })()
}
