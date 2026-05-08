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
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
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
