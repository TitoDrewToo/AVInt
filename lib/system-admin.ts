import { createClient, type User } from "@supabase/supabase-js"

export const ERROR_GROUP_STATUSES = ["new", "triaged", "resolved", "ignored"] as const
export type ErrorGroupStatus = typeof ERROR_GROUP_STATUSES[number]

const FINGERPRINT_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

export function isErrorGroupStatus(value: unknown): value is ErrorGroupStatus {
  return typeof value === "string" && ERROR_GROUP_STATUSES.includes(value as ErrorGroupStatus)
}

export function isErrorGroupFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value)
}

export async function getSystemAdminUser(accessToken: string | null | undefined): Promise<User | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey || !accessToken) return null

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken)
    if (authError || !user) return null

    // This query intentionally uses the user's anon client. The Phase 1 RLS
    // policy calls is_system_admin(), making this an actual allowlist check.
    const { data, error } = await userClient
      .from("system_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
    return !error && data?.user_id === user.id ? user : null
  } catch {
    return null
  }
}

export function bearerToken(value: string | null): string | null {
  const token = value?.replace(/^Bearer\s+/i, "").trim()
  return token || null
}
