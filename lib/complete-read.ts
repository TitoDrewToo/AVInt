/** Fail closed on truncated, excessive, or changing result counts. Not a DB snapshot. */
export async function readComplete<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null; count: number | null; error: unknown
}>, maximum = 100_000, label = "read"): Promise<T[]> {
  const rows: T[] = []
  let expected: number | undefined
  do {
    const page = await fetchPage(rows.length, Math.min(rows.length + 499, maximum))
    if (page.error || page.count === null || !page.data) {
      const cause = page.error instanceof Error ? page.error.message : page.error ? JSON.stringify(page.error) : "count unavailable"
      throw new Error(`Complete read unavailable (${label}): ${cause}${cause === "count unavailable" || cause === "{}" || cause === '{"message":""}' ? "; empty error body; query shape unavailable at client boundary" : ""}`)
    }
    if (page.count > maximum || (expected !== undefined && page.count !== expected)) throw new Error("Result exceeds limit or changed during read")
    expected = page.count
    if (page.data.length === 0 && rows.length < expected) throw new Error("Incomplete result")
    rows.push(...page.data)
    if (rows.length > expected) throw new Error("Inconsistent result")
  } while (rows.length < expected!)
  return rows
}
