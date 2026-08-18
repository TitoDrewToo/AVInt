"use server"

import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit } from "@/lib/rate-limit"

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PartnerInquiryInput = {
  name?: unknown
  firm?: unknown
  email?: unknown
  clientCount?: unknown
  message?: unknown
  honeypot?: unknown
  startedAt?: unknown
}

type PartnerInquiryResult = { ok: true } | { ok: true; spam: true } | { ok: false; error: string }

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function submitPartnerInquiry(input: PartnerInquiryInput): Promise<PartnerInquiryResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "Please check the form details." }

  const honeypot = typeof input.honeypot === "string" ? input.honeypot : ""
  const startedAt = typeof input.startedAt === "number" ? input.startedAt : Number.NaN
  if (honeypot || !Number.isFinite(startedAt) || Date.now() - startedAt < 1200) return { ok: true, spam: true }

  const name = typeof input.name === "string" ? input.name.trim() : ""
  const firm = typeof input.firm === "string" ? input.firm.trim() : ""
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  const message = typeof input.message === "string" ? input.message.trim() : ""
  const rawClientCount = typeof input.clientCount === "string" ? input.clientCount.trim() : ""

  if (!name || name.length > 100 || !firm || firm.length > 180 || !EMAIL_PATTERN.test(email) || email.length > 254 || !message || message.length > 3000) {
    return { ok: false, error: "Please check your name, firm, email, and message." }
  }

  let clientCount: number | null = null
  if (rawClientCount) {
    if (!/^\d+$/.test(rawClientCount)) return { ok: false, error: "Please enter an approximate client count." }
    clientCount = Number(rawClientCount)
    if (!Number.isSafeInteger(clientCount) || clientCount > 1_000_000) return { ok: false, error: "Please enter an approximate client count." }
  }

  const requestHeaders = await headers()
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  if (!(await checkRateLimit("partner-inquiry", address, 15 * 60, 5))) {
    return { ok: false, error: "Too many submissions from this address. Please try again later." }
  }

  const supabase = adminClient()
  if (!supabase) return { ok: false, error: "The partner form is temporarily unavailable." }

  const inquiryId = crypto.randomUUID()
  const { error } = await supabase.from("partner_inquiries").insert({
    id: inquiryId,
    name,
    firm,
    email,
    client_count: clientCount,
    message,
    status: "new",
  })
  if (error) {
    console.error("[partner-inquiry] Could not save inquiry:", error.message)
    return { ok: false, error: "We couldn’t send that just now. Please try again." }
  }

  await notifyPartnerInquiry({ inquiryId, name, firm, email, clientCount, message })
  return { ok: true }
}

type PartnerInquiryNotification = {
  inquiryId: string
  name: string
  firm: string
  email: string
  clientCount: number | null
  message: string
}

async function notifyPartnerInquiry(details: PartnerInquiryNotification) {
  if (!UUID_PATTERN.test(details.inquiryId)) return

  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn("[partner-inquiry] RESEND_API_KEY not set; skipping email.")
      return
    }

    const from = process.env.INQUIRY_NOTIFY_FROM || "AVIntelligence <support@avintph.com>"
    const body = [
      "New accounting-firm partner inquiry",
      "",
      `Name: ${details.name}`,
      `Firm: ${details.firm}`,
      `Email: ${details.email}`,
      `Approx. 1099/self-employed clients: ${details.clientCount ?? "Not provided"}`,
      "",
      `Message:\n${details.message}`,
    ].join("\n")

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: "support@avintph.com",
        reply_to: details.email,
        subject: `New partner inquiry from ${details.firm}`,
        text: body,
      }),
    })
    if (!response.ok) console.error("[partner-inquiry] Resend send failed:", response.status, await response.text().catch(() => ""))
  } catch (error) {
    console.error("[partner-inquiry] Notification error:", error instanceof Error ? error.message : error)
  }
}
