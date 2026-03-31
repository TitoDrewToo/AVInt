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

export async function GET() {
  const [supabase, lemon] = await Promise.all([
    fetchProviderStatus("https://status.supabase.com/api/v2/status.json"),
    fetchProviderStatus("https://lmsqueezy.statuspage.io/api/v2/status.json"),
  ])

  const indicators = [supabase, lemon]
  const anyMajor = indicators.some((s) => ["major", "critical"].includes(s))
  const anyMinor = indicators.some((s) => s === "minor" || s === "maintenance")
  const allClear = indicators.every((s) => s === "none" || s === "unknown")

  const overall: "operational" | "degraded" | "outage" =
    anyMajor ? "outage" : anyMinor ? "degraded" : allClear ? "operational" : "degraded"

  return NextResponse.json({
    overall,
    providers: { supabase, lemon },
  })
}
