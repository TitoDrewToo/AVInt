"use server"

import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { checkRateLimit } from "@/lib/rate-limit"

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

async function notifyStudioInquiry(details: { inquiryId: string; name: string; email: string; company: string; message: string }) {
  if (!UUID_PATTERN.test(details.inquiryId)) return
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn("[studio-inquiry] RESEND_API_KEY not set; skipping email.")
      return
    }
    const from = process.env.INQUIRY_NOTIFY_FROM || "AVIntelligence <support@avintph.com>"
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
      body: JSON.stringify({ from, to: "support@avintph.com", reply_to: details.email, subject: `New studio inquiry from ${details.name}`, text: body }),
    })
    if (!response.ok) console.error("[studio-inquiry] Resend send failed:", response.status, await response.text().catch(() => ""))
  } catch (error) {
    console.error("[studio-inquiry] Notification error:", error instanceof Error ? error.message : error)
  }
}
