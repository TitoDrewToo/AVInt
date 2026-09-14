"use server"

import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit } from "@/lib/rate-limit"
import { computeEntitlement } from "@/lib/entitlement"

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type StudioInquiryInput = {
  name?: unknown
  email?: unknown
  company?: unknown
  message?: unknown
  honeypot?: unknown
  startedAt?: unknown
}

type StudioInquiryResult = { ok: true; spam?: boolean } | { ok: false; error: string }
type SupportInput = { email?: unknown; subject?: unknown; message?: unknown; accessToken?: unknown; context?: unknown; honeypot?: unknown; startedAt?: unknown }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function submitStudioInquiry(input: StudioInquiryInput): Promise<StudioInquiryResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "Please check the form details." }

  const honeypot = typeof input.honeypot === "string" ? input.honeypot : ""
  const startedAt = typeof input.startedAt === "number" ? input.startedAt : Number.NaN
  if (honeypot || !Number.isFinite(startedAt) || Date.now() - startedAt < 1200) return { ok: true, spam: true }

  const name = typeof input.name === "string" ? input.name.trim() : ""
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  const company = typeof input.company === "string" ? input.company.trim() : ""
  const message = typeof input.message === "string" ? input.message.trim() : ""
  if (!name || name.length > 100 || !EMAIL_PATTERN.test(email) || email.length > 254 || company.length > 180 || !message || message.length > 3000) {
    return { ok: false, error: "Please check your name, email, and message." }
  }

  const requestHeaders = await headers()
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  if (!(await checkRateLimit("studio-inquiry", address, 15 * 60, 5))) {
    return { ok: false, error: "Too many submissions from this address. Please try again later." }
  }

  const supabase = adminClient()
  if (!supabase) return { ok: false, error: "The studio form is temporarily unavailable." }

  const inquiryId = crypto.randomUUID()
  const { error } = await supabase.from("studio_inquiries").insert({
    id: inquiryId,
    name,
    email,
    company: company || null,
    message,
    status: "new",
  })
  if (error) {
    console.error("[studio-inquiry] Could not save inquiry:", error.message)
    return { ok: false, error: "We couldn’t send that just now. Please try again." }
  }

  await notifyStudioInquiry({ inquiryId, name, email, company, message })
  return { ok: true }
}

export async function submitSupportRequest(input: SupportInput): Promise<StudioInquiryResult & { reference?: string }> {
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : ""
  const subject = typeof input?.subject === "string" ? input.subject.replace(/[\r\n]+/g, " ").trim() : ""
  const message = typeof input?.message === "string" ? input.message.trim() : ""
  if (input.honeypot || typeof input.startedAt !== "number" || !Number.isFinite(input.startedAt) || Date.now() - input.startedAt < 1200) return { ok: true, spam: true }
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !subject || subject.length > 180 || !message || message.length > 4000) return { ok: false, error: "Please check your email, subject, and message." }
  const requestHeaders = await headers()
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  if (!(await checkRateLimit("support-inquiry", address, 15 * 60, 5))) return { ok: false, error: "Too many support requests from this address. Please try again later." }
  const supabase = adminClient()
  if (!supabase) return { ok: false, error: "Support is temporarily unavailable." }
  let userId: string | null = null
  const token = typeof input.accessToken === "string" ? input.accessToken : requestHeaders.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (token) userId = (await supabase.auth.getUser(token)).data.user?.id ?? null
  let context: Record<string, unknown> = {}
  if (userId) {
    const [{ data: subscription }, { data: latestError }] = await Promise.all([
      supabase.from("subscriptions").select("status, plan, current_period_end").eq("user_id", userId).maybeSingle(),
      supabase.from("error_events").select("occurred_at, tool, fn, route, message, context").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    context = { user_id: userId, plan: computeEntitlement(subscription).tier, latest_error: latestError ?? null }
  }
  const id = crypto.randomUUID()
  const { error } = await supabase.from("support_inquiries").insert({ id, user_id: userId, email, subject, message, context, status: "open" })
  if (error) return { ok: false, error: "We couldn’t send that just now. Please try again." }
  await notifySupportRequest({ id, email, subject, message })
  return { ok: true, reference: id.slice(0, 8).toUpperCase() }
}

async function notifySupportRequest(details: { id: string; email: string; subject: string; message: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  const from = process.env.INQUIRY_NOTIFY_FROM || "AVIntelligence <support@avintph.com>"
  const to = process.env.INQUIRY_NOTIFY_TO || "developer@avintph.com"
  const body = `Support request ${details.id}\n\nSubject: ${details.subject}\nFrom: ${details.email}\n\n${details.message}`
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, reply_to: details.email, subject: `[Support] ${details.subject}`, text: body }) }).catch(() => undefined)
  await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: details.email, subject: `We received your AVIntelligence support request (${details.id.slice(0, 8).toUpperCase()})`, text: `We received your request and will follow up. Reference: ${details.id.slice(0, 8).toUpperCase()}` }) }).catch(() => undefined)
}

async function notifyStudioInquiry(details: { inquiryId: string; name: string; email: string; company: string; message: string }) {
  if (!UUID_PATTERN.test(details.inquiryId)) return
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn("[studio-inquiry] RESEND_API_KEY not set; skipping email.")
      return
    }
    const from = process.env.INQUIRY_NOTIFY_FROM || "AVIntelligence <support@avintph.com>"
    const recipient = process.env.INQUIRY_NOTIFY_TO || "developer@avintph.com"
    const body = [
      "New studio inquiry",
      "",
      `Name: ${details.name}`,
      `Email: ${details.email}`,
      `Company: ${details.company || "Not provided"}`,
      "",
      `Message:\n${details.message}`,
    ].join("\n")
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipient, reply_to: details.email, subject: `New studio inquiry from ${details.name}`, text: body }),
    })
    if (!response.ok) console.error("[studio-inquiry] Resend send failed:", response.status, await response.text().catch(() => ""))
  } catch (error) {
    console.error("[studio-inquiry] Notification error:", error instanceof Error ? error.message : error)
  }
}
