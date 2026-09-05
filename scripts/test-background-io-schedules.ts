import assert from "node:assert/strict"
import fs from "node:fs"

const migrationPath = "supabase/migrations/20260905040000_reduce_background_io.sql"
assert.equal(fs.existsSync(migrationPath), true, "background IO migration must exist")

const migration = fs.readFileSync(migrationPath, "utf8")

assert.match(migration, /cron\.unschedule\([^;]*reprocess-stuck-normalizations/is)
assert.doesNotMatch(migration, /cron\.schedule\([^;]*reprocess-stuck-normalizations/is)
assert.match(migration, /cron\.unschedule\([^;]*sweep-stuck-jobs/is)
assert.match(migration, /cron\.schedule\([\s\S]*?'sweep-stuck-jobs'[\s\S]*?'17 \* \* \* \*'/i)
assert.match(migration, /cron\.unschedule\([^;]*rate-limits-cleanup/is)
assert.match(migration, /cron\.schedule\([\s\S]*?'rate-limits-cleanup'[\s\S]*?'30 4 \* \* \*'/i)
assert.match(migration, /create index if not exists extractions_reprocess_eligibility_idx/i)
assert.match(migration, /where attempt_number = 1 and status = 'succeeded'/i)
assert.match(migration, /create index if not exists extractions_successful_retry_idx/i)
assert.match(migration, /where attempt_number > 1 and status = 'succeeded'/i)
assert.match(migration, /create index if not exists processing_jobs_stuck_idx/i)
assert.match(migration, /where status in \('uploaded', 'processing'\)/i)

console.log("background IO schedule contracts passed")
