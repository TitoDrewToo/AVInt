import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"

const SUPPORTED_CODE = /^[A-Z]{3}$/
const SOURCE = "Frankfurter"

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
