import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { serverError } from "@/lib/api-error"

const SUPPORTED_CODE = /^[A-Z]{3}$/
const SOURCE = "Frankfurter"

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("Missing Supabase service role configuration")
  return createClient(url, serviceRoleKey)
}

function cleanCurrency(value: string | null) {
  const code = (value ?? "").trim().toUpperCase()
  return SUPPORTED_CODE.test(code) ? code : null
}

function cleanQuotes(value: string | null, base: string) {
  return [...new Set((value ?? "")
    .split(",")
    .map((part) => cleanCurrency(part))
    .filter((code): code is string => !!code && code !== base))]
}

async function fetchV1(base: string, quotes: string[]) {
  const url = new URL("https://api.frankfurter.dev/v1/latest")
  url.searchParams.set("base", base)
  url.searchParams.set("symbols", quotes.join(","))
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } })
  if (!res.ok) throw new Error(`Frankfurter v1 failed: ${res.status}`)
  const data = await res.json()
  return {
    base: data.base ?? base,
    date: data.date ?? null,
    rates: data.rates ?? {},
  }
}

async function fetchV2(base: string, quotes: string[]) {
  const url = new URL("https://api.frankfurter.dev/v2/rates")
  url.searchParams.set("base", base)
  url.searchParams.set("quotes", quotes.join(","))
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } })
  if (!res.ok) throw new Error(`Frankfurter v2 failed: ${res.status}`)
  const rows = await res.json()
  const rates: Record<string, number> = {}
  let date: string | null = null
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row?.quote === "string" && typeof row?.rate === "number") {
      rates[row.quote.toUpperCase()] = row.rate
      date = row.date ?? date
    }
  }
  return { base, date, rates }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const base = cleanCurrency(searchParams.get("base"))
    if (!base) return NextResponse.json({ error: "Invalid base currency" }, { status: 400 })

    const quotes = cleanQuotes(searchParams.get("quotes"), base)
    if (!quotes.length) {
      return NextResponse.json(
        { source: SOURCE, base, date: null, rates: {} },
        { headers: { "Cache-Control": "public, max-age=43200, stale-while-revalidate=86400" } },
      )
    }

    let payload
    try {
      payload = await fetchV1(base, quotes)
    } catch {
      payload = await fetchV2(base, quotes)
    }

    return NextResponse.json(
      { source: SOURCE, ...payload },
      { headers: { "Cache-Control": "public, max-age=43200, stale-while-revalidate=86400" } },
    )
  } catch (err) {
    return serverError(err, { route: "fx/rates", stage: "fetch" })
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await supabaseAdmin().auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const tuples = Array.isArray(body?.tuples) ? body.tuples : []
    const cleaned = tuples.map((tuple: any) => ({
      date: typeof tuple?.date === "string" ? tuple.date.slice(0, 10) : null,
      base: cleanCurrency(tuple?.base ?? tuple?.from ?? null),
      target: cleanCurrency(tuple?.target ?? tuple?.to ?? null),
    })).filter((tuple: any) => tuple.date && tuple.base && tuple.target && tuple.base !== tuple.target)

    if (!cleaned.length) return NextResponse.json({ inserted: 0, errors: [] })

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fx-backfill`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ tuples: cleaned }),
    })

    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      return NextResponse.json(payload ?? { error: "FX backfill failed" }, { status: res.status })
    }
    return NextResponse.json(payload)
  } catch (err) {
    return serverError(err, { route: "fx/rates", stage: "backfill" })
  }
}
