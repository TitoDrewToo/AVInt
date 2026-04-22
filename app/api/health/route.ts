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

// Gemini — parse Google Cloud public incidents feed (no API key, no cost)
// Active incidents (end === null) affecting Generative AI / Vertex AI = degraded/outage
async function checkGemini(): Promise<string> {
  const GEMINI_PRODUCTS = ["generative", "vertex", "ai platform", "gemini"]
  try {
    const res = await fetch("https://status.cloud.google.com/incidents.json", {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    })
    if (!res.ok) return "unknown"
    const incidents: any[] = await res.json()
    const active = incidents.filter((i) => i.end === null)
    const affected = active.some((i) =>
      (i.affected_products ?? []).some((p: any) =>
        GEMINI_PRODUCTS.some((kw) => p.title?.toLowerCase().includes(kw))
      )
    )
    if (!affected) return "none"
    const severe = active.some((i) =>
      i.severity === "high" &&
      (i.affected_products ?? []).some((p: any) =>
        GEMINI_PRODUCTS.some((kw) => p.title?.toLowerCase().includes(kw))
      )
    )
    return severe ? "major" : "minor"
  } catch {
    return "unknown"
  }
}

function worstOf(...indicators: string[]): "operational" | "degraded" | "outage" {
  if (indicators.some((s) => ["major", "critical"].includes(s))) return "outage"
  if (indicators.some((s) => ["minor", "maintenance"].includes(s))) return "degraded"
  return "operational"
}

export async function GET() {
  const [supabase, vercel, openai, anthropic, gemini] = await Promise.all([
    checkSupabase(),
    fetchStatusPage("https://www.vercel-status.com/api/v2/status.json"),
    fetchStatusPage("https://status.openai.com/api/v2/status.json"),
    fetchStatusPage("https://status.anthropic.com/api/v2/status.json"),
    checkGemini(),
  ])

  const overall = worstOf(supabase, vercel, openai, anthropic, gemini)

  return NextResponse.json({
    overall,
    providers: { supabase, vercel, openai, anthropic, gemini },
  })
}
