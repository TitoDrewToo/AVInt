"use server"

import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"

import {
  bearerToken,
  getSystemAdminUser,
  isErrorGroupFingerprint,
  isErrorGroupStatus,
  type ErrorGroupStatus,
} from "@/lib/system-admin"

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function updateErrorGroupStatus(
  fingerprint: string,
  status: ErrorGroupStatus,
  accessToken?: string | null,
) {
  if (!isErrorGroupFingerprint(fingerprint) || !isErrorGroupStatus(status)) {
    return { ok: false as const, error: "Invalid group status request" }
  }

  const requestHeaders = await headers()
  const token = accessToken ?? bearerToken(requestHeaders.get("authorization"))
  const user = await getSystemAdminUser(token)
  if (!user) return { ok: false as const, error: "Forbidden" }

  const client = adminClient()
  if (!client) return { ok: false as const, error: "Monitoring storage is unavailable" }
  const { data, error } = await client
    .from("error_groups")
    .update({ status })
    .eq("fingerprint", fingerprint)
    .select("fingerprint, status")
    .maybeSingle()
  if (error || !data) return { ok: false as const, error: error?.message ?? "Error group not found" }
  return { ok: true as const, group: data }
}
