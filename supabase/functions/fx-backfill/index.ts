import { createClient, serve } from "../_shared/deps.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"
import { logError, logEvent } from "../_shared/log.ts"

const FN = "fx-backfill"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CODE_RE = /^[A-Z]{3}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Tuple = { date: string; base: string; target: string }
type ErrorTuple = Tuple & { message: string }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase()
  return CODE_RE.test(code) ? code : null
}

function normalizeDate(value: unknown): string | null {
  const date = String(value ?? "").trim()
  return DATE_RE.test(date) ? date : null
}

function previousDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function requestTuples(body: any): Tuple[] {
  if (Array.isArray(body?.tuples)) {
    return body.tuples
      .map((tuple: any) => ({
        date: normalizeDate(tuple.date),
        base: normalizeCurrency(tuple.base ?? tuple.from),
        target: normalizeCurrency(tuple.target ?? tuple.to),
      }))
      .filter((tuple: any): tuple is Tuple => Boolean(tuple.date && tuple.base && tuple.target && tuple.base !== tuple.target))
  }

  const dates = Array.isArray(body?.dates)
    ? body.dates.map(normalizeDate).filter((date: string | null): date is string => Boolean(date))
    : []
  const pairs = Array.isArray(body?.pairs)
    ? body.pairs.map((pair: any) => {
        const base = normalizeCurrency(pair?.[0] ?? pair?.base ?? pair?.from)
        const target = normalizeCurrency(pair?.[1] ?? pair?.target ?? pair?.to)
        return base && target && base !== target ? { base, target } : null
      }).filter(Boolean) as Array<{ base: string; target: string }>
    : []

  const tuples: Tuple[] = []
  for (const date of dates) {
    for (const pair of pairs) tuples.push({ date, ...pair })
  }
  return tuples
}

async function exactRateExists(supabase: any, tuple: Tuple): Promise<boolean> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("rate")
    .eq("rate_date", tuple.date)
    .eq("base_currency", tuple.base)
    .eq("target_currency", tuple.target)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function storedRateExists(supabase: any, tuple: Tuple, rateDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("rate")
    .eq("rate_date", rateDate)
    .eq("base_currency", tuple.base)
    .eq("target_currency", tuple.target)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function fetchFrankfurterRate(tuple: Tuple): Promise<{ rateDate: string; rate: number }> {
  let candidate = tuple.date
  while (true) {
    const url = new URL(`https://api.frankfurter.dev/v1/${candidate}`)
    url.searchParams.set("from", tuple.base)
    url.searchParams.set("to", tuple.target)

    const res = await fetchWithTimeout(url, {}, 20_000)
    if (!res.ok) throw new Error(`Frankfurter failed ${res.status} for ${tuple.base}-${tuple.target} on ${candidate}`)

    const payload = await res.json()
    const rate = payload?.rates?.[tuple.target]
    if (typeof rate === "number" && Number.isFinite(rate)) {
      return { rateDate: normalizeDate(payload.date) ?? candidate, rate }
    }

    candidate = previousDate(candidate)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok")

  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Unauthorized" }, 401)
  }

  let body: any = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return json({ error: "Invalid request body" }, 400)
  }

  const tuples = requestTuples(body)
  const unique = new Map(tuples.map((tuple) => [`${tuple.date}|${tuple.base}|${tuple.target}`, tuple]))
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const errors: ErrorTuple[] = []
  let inserted = 0

  for (const tuple of unique.values()) {
    try {
      if (await exactRateExists(supabase, tuple)) continue

      const fetched = await fetchFrankfurterRate(tuple)
      const alreadyStored = await storedRateExists(supabase, tuple, fetched.rateDate)
      const { error } = await supabase
        .from("fx_rates")
        .upsert({
          rate_date: fetched.rateDate,
          base_currency: tuple.base,
          target_currency: tuple.target,
          rate: fetched.rate,
          source: "frankfurter",
        }, { onConflict: "rate_date,base_currency,target_currency", ignoreDuplicates: true })

      if (error) throw error
      if (!alreadyStored) inserted++
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push({ ...tuple, message })
      logError(FN, "tuple_failed", error, tuple)
    }
  }

  logEvent(FN, "completed", { requested: unique.size, inserted, errors: errors.length })
  return json({ inserted, errors })
})
