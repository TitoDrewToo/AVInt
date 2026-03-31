import { NextResponse } from "next/server"

// Fetch Atlassian statuspage.io JSON — returns indicator string
async function fetchStatusPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return "unknown"
    const data = await res.json()
    return data?.status?.indicator ?? "none"
  } catch {
    return "unknown"
  }
}

// Direct Supabase REST ping — any response from the endpoint means it's up
async function checkSupabase(): Promise<string> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return fetchStatusPage("https://status.supabase.com/api/v2/status.json")
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    })
    // REST root returns 200 or 400 (no table specified) — both mean the service is up
    return res.status < 500 ? "none" : "major"
  } catch {
    return "major"
  }
}

// Direct Gemini models list — cheapest call that confirms key + service are alive
async function checkGemini(): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return "unknown"
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: AbortSignal.timeout(5000), next: { revalidate: 60 } }
    )
    if (res.ok) return "none"
    if (res.status >= 500) return "major"
    if (res.status === 429) return "minor"  // rate limited, but service is up
    return "none" // other 4xx = API is reachable
  } catch {
    return "major"
  }
}

function worstOf(...indicators: string[]): "operational" | "degraded" | "outage" {
  if (indicators.some((s) => ["major", "critical"].includes(s))) return "outage"
  if (indicators.some((s) => ["minor", "maintenance"].includes(s))) return "degraded"
  return "operational"
}

export async function GET() {
  const [supabase, lemon, openai, anthropic, gemini] = await Promise.all([
    checkSupabase(),
    fetchStatusPage("https://status.lemonsqueezy.com/api/v2/status.json"),
    fetchStatusPage("https://status.openai.com/api/v2/status.json"),
    fetchStatusPage("https://status.anthropic.com/api/v2/status.json"),
    checkGemini(),
  ])

  const overall = worstOf(supabase, lemon, openai, anthropic, gemini)

  return NextResponse.json({
    overall,
    providers: { supabase, lemon, openai, anthropic, gemini },
  })
}
