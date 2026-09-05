import assert from "node:assert/strict"
import fs from "node:fs"

const root = process.cwd()
const migration = fs.readFileSync(`${root}/supabase/migrations/20260905020000_dashboard_canonical_analytics.sql`, "utf8")
assert.match(migration, /excluded_at is null/gi)
assert.match(migration, /get_dashboard_currencies/)
assert.match(migration, /get_dashboard_record_analytics/)
assert.match(migration, /get_dashboard_attribute_analytics/)
assert.match(migration, /counterparty_normalized/)
assert.match(migration, /revoke all on function public\.get_dashboard_record_analytics/)
assert.match(migration, /create table if not exists public\.dashboard_pages/)
assert.match(migration, /unique \(user_id, slug\)/)
assert.match(migration, /delete from public\.dashboard_pages where user_id = p_user_id/)
assert.match(migration, /'dashboard_pages', v_dp_count/)
assert.match(migration, /revoke all on function public\.delete_user_data\(uuid\) from public, anon, authenticated/)
assert.match(migration, /revoke all on function public\.get_record_summary\(uuid, date, date\)/)

const edge = fs.readFileSync(`${root}/supabase/functions/generate-advanced-analytics/index.ts`, "utf8")
assert.doesNotMatch(edge, /const totalTax = 0/)
assert.doesNotMatch(edge, /const paymentMethods: Record<string, number> = \{\}/)
assert.match(edge, /get_dashboard_record_analytics/)
assert.match(edge, /get_dashboard_attribute_analytics/)
for (const relative of ["supabase/functions/generate-context-summary/index.ts", "supabase/functions/generate-rd-analytics/index.ts"]) {
  const consumer = fs.readFileSync(`${root}/${relative}`, "utf8")
  assert.match(consumer, /get_dashboard_record_analytics/)
  assert.doesNotMatch(consumer, /get_record_amounts_by_(?:month|category|counterparty)/)
}
const rd = fs.readFileSync(`${root}/supabase/functions/generate-rd-analytics/index.ts`, "utf8")
assert.match(rd, /\.is\("excluded_at", null\)/)
assert.match(rd, /page_id: dashboardPageId/)
console.log("dashboard canonical mapping contracts passed")
