import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

type SeedRecord = {
  user_id: string
  parent_record_id: string | null
  excluded_at: string | null
  needs_review: boolean
}

class CountQuery {
  private filters: Array<{ kind: "eq" | "is"; field: keyof SeedRecord; value: unknown }> = []

  constructor(private readonly rows: SeedRecord[]) {}

  select() { return this }
  eq(field: keyof SeedRecord, value: unknown) { this.filters.push({ kind: "eq", field, value }); return this }
  is(field: keyof SeedRecord, value: unknown) { this.filters.push({ kind: "is", field, value }); return this }
  then(resolve: (value: { count: number; error: null }) => unknown) {
    const count = this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value)).length
    return Promise.resolve(resolve({ count, error: null }))
  }
}

class ContextQuery {
  private filters: Array<(row: any) => boolean> = []
  private head = false
  private maxRows: number | null = null

  constructor(private readonly rows: any[]) {}

  select(_columns?: string, options?: { head?: boolean }) { this.head = options?.head === true; return this }
  eq(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this }
  is(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this }
  in(field: string, values: unknown[]) { this.filters.push((row) => values.includes(row[field])); return this }
  order() { return this }
  limit(value: number) { this.maxRows = value; return this }
  then(resolve: (value: { data?: any[]; count?: number; error: null }) => unknown) {
    const matching = this.rows.filter((row) => this.filters.every((filter) => filter(row)))
    return Promise.resolve(resolve(this.head
      ? { count: matching.length, error: null }
      : { data: this.maxRows === null ? matching : matching.slice(0, this.maxRows), error: null }))
  }
}

async function main() {
  const userId = "7f6457ff-b7a0-42f5-a0ef-f5fc4eb0e720"
  const rows: SeedRecord[] = [
    ...Array.from({ length: 44 }, () => ({ user_id: userId, parent_record_id: null, excluded_at: null, needs_review: false })),
    ...Array.from({ length: 25 }, () => ({ user_id: userId, parent_record_id: null, excluded_at: null, needs_review: true })),
    ...Array.from({ length: 3 }, () => ({ user_id: userId, parent_record_id: "parent", excluded_at: null, needs_review: true })),
    { user_id: userId, parent_record_id: null, excluded_at: "2026-09-01", needs_review: true },
    { user_id: "another-user", parent_record_id: null, excluded_at: null, needs_review: true },
  ]
  const client = { from: (table: string) => { assert.equal(table, "records"); return new CountQuery(rows) } }
  const { countProfileRecords } = await import("../lib/dashboard-ai-context")
  const counts = await countProfileRecords(client, userId)

  assert.deepEqual(counts, { activeRecordCount: 69, readyRecordCount: 44, attentionCount: 25 })
  console.log(JSON.stringify({ userId, ...counts }, null, 2))

  const contextRows = rows.map((row, index) => ({
    ...row,
    id: `record-${index}`,
    occurred_on: "2026-09-01",
    counterparty_normalized: "Example",
    amount: 10,
    currency: "USD",
    category: "expense",
    files: { document_type: "csv_export", filename: "fixture.csv", user_id: row.user_id },
  }))
  const contextClient = {
    from(table: string) {
      if (table === "files") return new ContextQuery([{ id: "file-1", user_id: userId, filename: "fixture.csv", document_type: "csv_export", upload_status: "normalized" }])
      if (table === "records") return new ContextQuery(contextRows)
      if (table === "record_attributes") return new ContextQuery([])
      throw new Error(`Unexpected table: ${table}`)
    },
  }
  const { buildDashboardAIContext } = await import("../lib/dashboard-ai-context")
  const profile = await buildDashboardAIContext(userId, contextClient)
  assert.equal(profile.accountId, userId)
  assert.equal(profile.activeRecordCount, 69)
  assert.equal(profile.readyRecordCount, 44)
  assert.equal(profile.attentionCount, 25)
  assert.equal(profile.recentRecords.length, 40)
  assert.deepEqual(profile.documentTypes, { csv_export: 44 })
  console.log(JSON.stringify({ accountId: profile.accountId, activeRecordCount: profile.activeRecordCount, readyRecordCount: profile.readyRecordCount, attentionCount: profile.attentionCount }, null, 2))
}

void main()
