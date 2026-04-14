// Backfill runner — re-normalizes document_fields rows whose
// normalization_version is below the current pipeline version.
//
// Usage:
//   npx tsx scripts/renormalize.ts              → dry run (lists stale rows)
//   npx tsx scripts/renormalize.ts --apply      → invokes the edge function
//   npx tsx scripts/renormalize.ts --apply --user <email>
//
// Requires env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js"

const CURRENT_NORMALIZATION_VERSION = 2

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const userIdx = args.indexOf("--user")
const targetEmail = userIdx >= 0 ? args[userIdx + 1] : null

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function main() {
  let query = supabase
    .from("document_fields")
    .select("id, file_id, normalization_version, files!inner(user_id, filename)")
    .or(`normalization_version.is.null,normalization_version.lt.${CURRENT_NORMALIZATION_VERSION}`)

  if (targetEmail) {
    const { data: user } = await supabase
      .from("auth.users")
      .select("id")
      .eq("email", targetEmail)
      .maybeSingle()
    if (!user) {
      console.error(`No user found for ${targetEmail}`)
      process.exit(1)
    }
    query = query.eq("files.user_id", user.id)
  }

  const { data, error } = await query
  if (error) {
    console.error("Query error:", error.message)
    process.exit(1)
  }
  const stale = data ?? []

  console.log(`Found ${stale.length} row(s) below v${CURRENT_NORMALIZATION_VERSION}`)
  if (stale.length === 0) return
  if (!apply) {
    console.log("Dry run — rerun with --apply to re-normalize.")
    for (const row of stale.slice(0, 20)) {
      console.log(`  ${row.file_id}  v${row.normalization_version ?? "null"}`)
    }
    if (stale.length > 20) console.log(`  … and ${stale.length - 20} more`)
    return
  }

  let ok = 0, fail = 0
  for (const row of stale) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/normalize-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ file_id: row.file_id }),
      })
      if (!res.ok) throw new Error(await res.text())
      ok++
      if (ok % 10 === 0) console.log(`  ${ok}/${stale.length} re-normalized`)
    } catch (err: unknown) {
      fail++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  fail ${row.file_id}: ${msg}`)
    }
  }
  console.log(`Done. ${ok} ok, ${fail} failed.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
