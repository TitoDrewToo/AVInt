"use server"

import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"

import { checkRateLimit } from "@/lib/rate-limit"
import { loadSystemJournal, nextTimeWindow, nextTopicScope, selectJournalContext, shouldEscalateDiagnosis, type JournalContext } from "@/lib/system-journal"
import { sanitizeErrorContext } from "@/lib/error-sanitize"
import { isReviewVerdict, shouldDiagnose, type ReviewVerdict } from "@/lib/system-diagnosis"
import {
  bearerToken,
  getSystemAdminUser,
  isErrorGroupFingerprint,
  isErrorGroupStatus,
  type ErrorGroupStatus,
} from "@/lib/system-admin"

type Diagnosis = { root_cause: string; affected_area: string; proposed_fix: string; risk_level: "low" | "medium" | "high"; confidence: number; severity: string; needs_more?: { time?: boolean; topic?: boolean }; ai_model?: string }

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
  const systemsInternalSecret = process.env.SYSTEMS_INTERNAL_SECRET
  if (!client || !functionUrl || !serviceKey || !systemsInternalSecret) return { ok: false as const, error: "Diagnosis service is unavailable" }

  const { data: group, error: groupError } = await client
    .from("error_groups")
    .select("*")
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
  const error = {
    message: representative?.message ?? group.title,
    stack: representative?.stack ?? null,
    tool: representative?.tool ?? null,
    fn: representative?.fn ?? null,
    action: representative?.action ?? null,
    route: representative?.route ?? null,
    severity: representative?.level ?? group.severity ?? null,
    occurred_at: representative?.occurred_at ?? group.last_seen,
    context: sanitizeErrorContext(representative?.context) ?? null,
  }
  const journal = await loadSystemJournal()
  let context = selectJournalContext(error, group, journal, force)
  const call = async (selectedContext: JournalContext) => {
    const response = await fetch(`${functionUrl}/functions/v1/diagnose-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${systemsInternalSecret}` },
      body: JSON.stringify({ fingerprint, journal_section: selectedContext.text, error }),
      signal: AbortSignal.timeout(35_000),
    }).catch(() => null)
    if (!response) return null
    const result = await response.json().catch(() => null)
    return { response, result }
  }
  let attempt = await call(context)
  if (!attempt || !attempt.response.ok || !attempt.result) return { ok: false as const, error: attempt?.result?.error ?? "Diagnosis request failed" }
  const first = attempt.result as Diagnosis
  const valid = (value: unknown): value is Diagnosis => {
    const item = value as Partial<Diagnosis> | null
    return Boolean(item && typeof item.root_cause === "string" && typeof item.affected_area === "string" && typeof item.proposed_fix === "string" && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1 && typeof item.severity === "string")
  }
  if (!valid(first)) return { ok: false as const, error: "Diagnosis returned an invalid result" }
  if (shouldEscalateDiagnosis(first)) {
    const lowConfidence = first.confidence < 0.5
    context = selectJournalContext(error, group, journal, force, {
      timeWindow: first.needs_more?.time || lowConfidence ? nextTimeWindow(context.timeWindow) : context.timeWindow,
      topicScope: first.needs_more?.topic || lowConfidence ? nextTopicScope(context.topicScope) : context.topicScope,
    })
    attempt = await call(context)
    if (!attempt || !attempt.response.ok || !attempt.result || !valid(attempt.result)) return { ok: false as const, error: attempt?.result?.error ?? "Diagnosis escalation failed" }
  }
  const result = attempt.result as Diagnosis
  const { data: updated, error: updateError } = await client.from("error_groups").update({
    ai_analysis: `Root cause: ${result.root_cause}\nAffected area: ${result.affected_area}`,
    proposed_fix: result.proposed_fix, risk_level: result.risk_level, confidence: result.confidence, severity: result.severity,
    diagnosed_at: new Date().toISOString(), ai_model: result.ai_model || process.env.ANTHROPIC_SYSTEMS_MODEL || "claude-haiku-4-5-20251001",
    context_scope: `${context.timeWindow}/${context.topicScope}`, status: group.status === "new" ? "triaged" : group.status,
  }).eq("fingerprint", fingerprint).select("*").single()
  if (updateError || !updated) return { ok: false as const, error: "Diagnosis returned, but could not be saved." }
  return { ok: true as const, skipped: false, group: updated }
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

export async function updateErrorGroupAction(
  fingerprint: string,
  actionTaken: string,
  accessToken?: string | null,
) {
  if (!isErrorGroupFingerprint(fingerprint) || actionTaken.length > 8_000) {
    return { ok: false as const, error: "Invalid action record" }
  }
  const requestHeaders = await headers()
  const token = accessToken ?? bearerToken(requestHeaders.get("authorization"))
  const user = await getSystemAdminUser(token)
  if (!user) return { ok: false as const, error: "Forbidden" }
  const client = adminClient()
  if (!client) return { ok: false as const, error: "Monitoring storage is unavailable" }
  const { data, error } = await client
    .from("error_groups")
    .update({
      action_taken: actionTaken.trim() || null,
      action_taken_at: actionTaken.trim() ? new Date().toISOString() : null,
      action_taken_by: actionTaken.trim() ? user.id : null,
    })
    .eq("fingerprint", fingerprint)
    .select("fingerprint, action_taken, action_taken_at, action_taken_by")
    .maybeSingle()
  if (error || !data) return { ok: false as const, error: error?.message ?? "Error group not found" }
  return { ok: true as const, group: data }
}
