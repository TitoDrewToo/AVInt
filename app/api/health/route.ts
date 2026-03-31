import { NextResponse } from "next/server"

async function fetchProviderStatus(url: string): Promise<string> {
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

function worstOf(...indicators: string[]): "operational" | "degraded" | "outage" {
  if (indicators.some((s) => ["major", "critical"].includes(s))) return "outage"
  if (indicators.some((s) => ["minor", "maintenance"].includes(s))) return "degraded"
  return "operational"
}

export async function GET() {
  const [supabase, lemon, openai, anthropic, gemini] = await Promise.all([
    fetchProviderStatus("https://status.supabase.com/api/v2/status.json"),
    fetchProviderStatus("https://lmsqueezy.statuspage.io/api/v2/status.json"),
    fetchProviderStatus("https://status.openai.com/api/v2/status.json"),
    fetchProviderStatus("https://status.anthropic.com/api/v2/status.json"),
    fetchProviderStatus("https://status.google.com/api/v2/status.json"),
  ])

  const overall = worstOf(supabase, lemon, openai, anthropic, gemini)

  return NextResponse.json({
    overall,
    providers: { supabase, lemon, openai, anthropic, gemini },
  })
}
