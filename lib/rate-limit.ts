import { createClient } from "@supabase/supabase-js"

// Service-role client — rate_limit_hit() is SECURITY DEFINER and granted to
// service_role only, so callers must have this key. Routes import this helper
// after their own auth check so `key` (typically user.id) is already trusted.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type RateLimitBucket = "chat" | "reports" | "delete-account" | "redeem-gift"

// Fail-open. If the rate-limit RPC is unreachable (network blip, Postgres
// hiccup) we let the request through rather than block legitimate users.
// Abuse control is the goal; it's acceptable to miss a few hits during an
// infra incident.
export async function checkRateLimit(
  bucket: RateLimitBucket,
  key: string,
  windowSeconds: number,
  maxCalls: number,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
    p_bucket:         bucket,
    p_key:            key,
    p_window_seconds: windowSeconds,
    p_max_calls:      maxCalls,
  })
  if (error) return true
  return data === true
}
