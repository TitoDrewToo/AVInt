"use server"

import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"

import { checkRateLimit } from "@/lib/rate-limit"
import { loadJournalSection } from "@/lib/system-journal"
import { sanitizeErrorContext } from "@/lib/error-sanitize"
import { isReviewVerdict, shouldDiagnose, type ReviewVerdict } from "@/lib/system-diagnosis"
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

export async function diagnoseErrorGroup(
  fingerprint: string,
  force = false,
  accessToken?: string | null,
) {
  if (!isErrorGroupFingerprint(fingerprint)) {
    return { ok: false as const, error: "Invalid fingerprint" }
  }
  const requestHeaders = await headers()
  const token = accessToken ?? bearerToken(requestHeaders.get("authorization"))
  const user = await getSystemAdminUser(token)
  if (!user) return { ok: false as const, error: "Forbidden" }

  const client = adminClient()
  const functionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!client || !functionUrl || !serviceKey) return { ok: false as const, error: "Diagnosis service is unavailable" }

  const { data: group, error: groupError } = await client
    .from("error_groups")
    .select("fingerprint, title, first_seen, last_seen, count, status, ai_analysis, proposed_fix, risk_level, confidence, severity, diagnosed_at, ai_model")
    .eq("fingerprint", fingerprint)
    .maybeSingle()
  if (groupError || !group) return { ok: false as const, error: groupError?.message ?? "Error group not found" }
  if (!shouldDiagnose(group.diagnosed_at, force)) return { ok: true as const, skipped: true, group }

  if (!(await checkRateLimit("systems-diagnose", `${user.id}:${fingerprint}`, 60, 5))) {
    return { ok: false as const, error: "Diagnosis rate limit reached. Try again shortly." }
  }

  const { data: events, error: eventsError } = await client
    .from("error_events")
    .select("message, stack, tool, fn, action, route, context, level, occurred_at")
    .eq("fingerprint", fingerprint)
    .order("occurred_at", { ascending: false })
    .limit(5)
  if (eventsError) return { ok: false as const, error: eventsError.message }

  const representative = events?.[0]
  const journalSection = await loadJournalSection(representative?.tool ?? null)
  const response = await fetch(`${functionUrl}/functions/v1/diagnose-error`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      fingerprint,
      journal_section: journalSection,
      error: {
        message: representative?.message ?? group.title,
        stack: representative?.stack ?? null,
        tool: representative?.tool ?? null,
        fn: representative?.fn ?? null,
        action: representative?.action ?? null,
        route: representative?.route ?? null,
        context: sanitizeErrorContext(representative?.context) ?? null,
      },
    }),
  }).catch(() => null)
  if (!response) return { ok: false as const, error: "Diagnosis request failed" }
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) return { ok: false as const, error: result?.error ?? "Diagnosis request failed" }
  return { ok: true as const, skipped: false, group: result }
}

export async function setErrorGroupReviewVerdict(
  fingerprint: string,
  verdict: ReviewVerdict,
  accessToken?: string | null,
) {
  if (!isErrorGroupFingerprint(fingerprint) || !isReviewVerdict(verdict)) {
    return { ok: false as const, error: "Invalid review verdict" }
  }
  const requestHeaders = await headers()
  const token = accessToken ?? bearerToken(requestHeaders.get("authorization"))
  const user = await getSystemAdminUser(token)
  if (!user) return { ok: false as const, error: "Forbidden" }
  const client = adminClient()
  if (!client) return { ok: false as const, error: "Monitoring storage is unavailable" }
  const { data, error } = await client
    .from("error_groups")
    .update({ review_verdict: verdict, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq("fingerprint", fingerprint)
    .select("fingerprint, review_verdict, reviewed_at, reviewed_by")
    .maybeSingle()
  if (error || !data) return { ok: false as const, error: error?.message ?? "Error group not found" }
  return { ok: true as const, group: data }
}
