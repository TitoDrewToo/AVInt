import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const migrations = resolve(process.cwd(), "supabase/migrations")
const baseline = readFileSync(resolve(migrations, "20260831120000_baseline_schema.sql"), "utf8")
const triggers = readFileSync(resolve(migrations, "20260901143637_maintain_updated_at_triggers.sql"), "utf8")
const retirement = readFileSync(resolve(migrations, "20260904005523_retire_legacy_document_and_virtual_layers.sql"), "utf8")
const reports = readFileSync(resolve(migrations, "20260904010428_report_definitions.sql"), "utf8")
const repair = readFileSync(resolve(migrations, "20260905010000_repair_account_deletion_after_legacy_retirement.sql"), "utf8")

for (const table of ["ai_usage_events", "document_fields", "extractions", "records", "record_attributes", "files", "folders", "gift_codes"]) {
  assert.match(baseline, new RegExp(`CREATE TABLE public\\.${table}\\b`, "i"), `${table} must exist before the forward migrations`)
}
assert.match(baseline, /document_field_id uuid/i)
assert.match(baseline, /UNIQUE \(file_id, attempt_number\)/i)
assert.match(triggers, /create or replace function public\.set_updated_at\(\)/i)

assert.match(retirement, /add column if not exists extraction_id uuid references public\.extractions/i)
assert.match(retirement, /drop column if exists document_field_id/i)
assert.match(retirement, /drop table if exists public\.document_fields/i)
assert.match(retirement, /drop table if exists public\.virtual_records/i)

for (const column of ["source", "scope", "period", "filters", "blocks", "theme", "authored_by", "version", "archived_at"]) {
  assert.match(reports, new RegExp(`\\b${column}\\s+`), `report_definitions.${column} must be declared`)
}
assert.match(reports, /enable row level security/i)
assert.match(reports, /create unique index if not exists report_definitions_user_slug_key/i)
assert.match(reports, /execute function public\.set_updated_at\(\)/i)
assert.equal("20260901143637" < "20260904010428", true, "the updated-at function must precede report definitions")

const repairedFunction = repair.slice(repair.indexOf("create or replace function public.delete_user_data"))
assert.doesNotMatch(repairedFunction, /\bdocument_fields\b(?!(?:',\s*0))/i, "the repaired function must not query the retired table")
assert.match(repairedFunction, /delete from public\.report_definitions/i)
assert.match(repairedFunction, /delete from public\.folders/i)
assert.match(repair, /foreign key \(issued_by_user_id\) references auth\.users\(id\) on delete set null/i)
assert.match(repair, /drop table if exists public\.virtual_field_catalog/i)
assert.match(repair, /add column if not exists filters jsonb not null default '\[\]'::jsonb/i)
assert.match(repair, /add constraint report_definitions_filters_is_array/i)
assert.match(repair, /alter table public\.report_definitions enable row level security/i)
assert.match(repair, /create trigger report_definitions_set_updated_at/i)
assert.equal("20260904010428" < "20260905010000", true, "the repair must run after both applied migrations")

console.log("smart-storage migration contracts: baseline, retirement, reports, and forward repair align")
