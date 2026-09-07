export type RateTuple = {
  date: string
  from: string
  to: string
}

export type RateEntry = {
  rate: number
  actual_rate_date: string
}

export type RatesMap = Record<string, RateEntry>

// How stale a rate may be before it stops being a defensible proxy for a
// transaction's conversion rate. Outside this window the rate is treated as
// missing, so the caller backfills the exact date or falls back to the
// split-currency view rather than silently presenting a stale conversion.
//
// 7 days, chosen against the observed USD->PHP series in `fx_rates`:
//
//   window   avg drift   p95     max
//     3d       0.37%     0.76%   0.86%
//     7d       0.36%     0.95%   1.29%
//    14d       0.41%     1.04%   1.41%
//    30d       0.57%     1.48%   2.42%
//    90d       1.23%     2.83%   4.59%
//
// Drift is flat to roughly a fortnight and climbs steeply after. 7 days sits on
// the flat part while still covering the longest realistic publication gap:
// Frankfurter follows ECB business days, so a weekend plus a holiday is ~5 days.
// 90 days admitted up to 4.59% error against a total observed range of 5.32% —
// it permitted 86% of all the movement there was, which is not a bound.
//
// Strictness is cheap here: because fx-backfill fetches the exact transaction
// date, the fallback from "no in-window rate" is one network request, not a
// broken dashboard. There is no reason to trade accuracy for slack.
export const MAX_RATE_AGE_DAYS = 7

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export function rateKey(date: string, from: string, to: string) {
  return `${date}|${from.toUpperCase()}|${to.toUpperCase()}`
}

function amountCandidate(row: any) {
  return row?.gross_income ?? row?.net_income ?? row?.total_amount
}

function dateDaysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function isWithinRateWindow(transactionDate: string, rateDate: unknown): rateDate is string {
  if (typeof rateDate !== "string" || !DATE_RE.test(rateDate)) return false
  const transaction = new Date(`${transactionDate}T00:00:00Z`).getTime()
  const rate = new Date(`${rateDate}T00:00:00Z`).getTime()
  const age = (transaction - rate) / (24 * 60 * 60 * 1000)
  return Number.isFinite(age) && age >= 0 && age <= MAX_RATE_AGE_DAYS
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  transactionDate: string,
  ratesMap: RatesMap,
): number {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  if (from === to) return amount

  const entry = ratesMap[rateKey(transactionDate, from, to)]
  if (!entry) throw new Error(`Missing FX rate for ${from}-${to} on ${transactionDate}`)
  return amount * entry.rate
}

export function getRequiredRateTuples(rows: any[], primaryCurrency: string): RateTuple[] {
  const primary = normalizeCurrency(primaryCurrency)
  if (!primary) return []

  const tuples = new Map<string, RateTuple>()
  for (const row of rows) {
    const from = normalizeCurrency(row?.currency)
    const date = typeof row?.document_date === "string" && DATE_RE.test(row.document_date.slice(0, 10))
      ? row.document_date.slice(0, 10)
      : null
    if (!from || !date || from === primary) continue
    if (amountCandidate(row) === null || amountCandidate(row) === undefined) continue
    const tuple = { date, from, to: primary }
    tuples.set(rateKey(date, from, primary), tuple)
  }
  return [...tuples.values()]
}

export async function fetchRatesFromDb(supabase: any, tuples: RateTuple[]): Promise<RatesMap> {
  const results = await Promise.all(tuples.map(async (tuple) => {
    const { data, error } = await supabase
      .from("fx_rates")
      .select("rate, rate_date")
      .eq("base_currency", tuple.from)
      .eq("target_currency", tuple.to)
      .lte("rate_date", tuple.date)
      .gte("rate_date", dateDaysBefore(tuple.date, MAX_RATE_AGE_DAYS))
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data && isWithinRateWindow(tuple.date, data.rate_date)
      ? {
          key: rateKey(tuple.date, tuple.from, tuple.to),
          entry: {
            rate: Number(data.rate),
            actual_rate_date: data.rate_date,
          },
        }
      : null
  }))

  const rates: RatesMap = {}
  for (const result of results) {
    if (result) rates[result.key] = result.entry
  }
  return rates
}

export async function ensureRatesExist(supabase: any, tuples: RateTuple[]): Promise<void> {
  if (tuples.length === 0) return

  const existing = await fetchRatesFromDb(supabase, tuples)
  const missing = tuples.filter((tuple) => !existing[rateKey(tuple.date, tuple.from, tuple.to)])
  if (missing.length === 0) return

  const { data: { session } } = await supabase.auth.getSession()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error("Missing Supabase URL for FX backfill")

  const res = await fetch(`${supabaseUrl}/functions/v1/fx-backfill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session?.access_token ?? ""}`,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify({ tuples: missing }),
  })

  if (!res.ok) throw new Error(`FX backfill failed: ${await res.text()}`)
  const payload = await res.json()
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(`FX backfill failed for ${payload.errors.length} rate tuple${payload.errors.length === 1 ? "" : "s"}`)
  }
}
