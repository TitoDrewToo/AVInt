import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  claimPrescanFile,
  outcomeForRejection,
  recordPrescanEvent,
  resolvePrescanNotice,
  terminalEventForOutcome,
  upsertPrescanFileRetention,
  upsertPrescanNotice,
} from "../supabase/functions/_shared/prescan-lifecycle"
import { intendedPrescanTarget, reconcilePrescanStorageState } from "../lib/prescan-reconciliation"

function claimClient(initialStatus: string) {
  let status = initialStatus
  let processInvocations = 0
  const client = {
    from(table: string) {
      assert.equal(table, "files")
      const filters: Record<string, unknown> = {}
      let allowed: string[] = []
      const query = {
        update() { return query },
        eq(column: string, value: unknown) { filters[column] = value; return query },
        in(column: string, values: string[]) { assert.equal(column, "upload_status"); allowed = values; return query },
        select() { return query },
        async maybeSingle() {
          await Promise.resolve()
          if (filters.id !== "file-1" || filters.user_id !== "user-1" || !allowed.includes(status)) {
            return { data: null, error: null }
          }
          status = "scanning"
          return { data: { id: "file-1", user_id: "user-1", upload_status: status }, error: null }
        },
      }
      return query
    },
  }
  return {
    client,
    invokeProcess() { processInvocations += 1 },
    get state() { return { status, processInvocations } },
  }
}

async function main() {
  const fixture = claimClient("pending_scan")
  const claims = await Promise.all([
    claimPrescanFile(fixture.client, "file-1", "user-1"),
    claimPrescanFile(fixture.client, "file-1", "user-1"),
  ])
  for (const claim of claims) if (claim) fixture.invokeProcess()
  assert.equal(claims.filter(Boolean).length, 1)
  assert.deepEqual(fixture.state, { status: "scanning", processInvocations: 1 })

  const retryFixture = claimClient("scan_failed")
  assert.ok(await claimPrescanFile(retryFixture.client, "file-1", "user-1"))
  assert.equal(retryFixture.state.status, "scanning")

  assert.equal(outcomeForRejection("pdf_active_content"), "quarantined")
  assert.equal(outcomeForRejection("xlsx_archive_bomb"), "quarantined")
  assert.equal(outcomeForRejection("csv_malformed"), "rejected")
  assert.equal(outcomeForRejection("content_unrelated"), "rejected")
  assert.equal(terminalEventForOutcome("scan_failed"), "prescan.retry_required")
  assert.equal(intendedPrescanTarget("user-1/_inbox/file.csv", "user-1", "approve"), "user-1/file.csv")
  assert.equal(intendedPrescanTarget("user-1/_inbox/file.csv", "user-1", "quarantine"), "user-1/_quarantine/file.csv")
  assert.equal(intendedPrescanTarget("other/_inbox/file.csv", "user-1", "approve"), null)
  assert.equal(reconcilePrescanStorageState({ intent: "approve", sourceExists: false, targetExists: true }), "restore_then_retry")
  assert.equal(reconcilePrescanStorageState({ intent: "quarantine", sourceExists: true, targetExists: false }), "hold_for_retry")
  assert.equal(reconcilePrescanStorageState({ intent: null, sourceExists: true, targetExists: false }), "hold_for_retry")

  let inserted: Record<string, unknown> | null = null
  const evidenceClient = {
    from(table: string) {
      assert.equal(table, "prescan_security_events")
      return { async insert(value: Record<string, unknown>) { inserted = value; return { error: null } } }
    },
  }
  await recordPrescanEvent(evidenceClient, {
    correlationId: "correlation-1",
    accountId: "user-1",
    fileId: "file-1",
    filename: "safe.csv",
    fileSize: 12,
    stage: "claim",
    eventType: "prescan.claimed",
  })
  assert.equal(inserted?.filename, "safe.csv")
  assert.equal("signed_url" in (inserted ?? {}), false)
  assert.equal("raw_content" in (inserted ?? {}), false)

  const noticeWrites: Array<{ operation: string; value: unknown }> = []
  const noticeClient = {
    from(table: string) {
      assert.equal(table, "prescan_rejection_notices")
      const query = {
        async upsert(value: unknown) { noticeWrites.push({ operation: "upsert", value }); return { error: null } },
        update(value: unknown) { noticeWrites.push({ operation: "update", value }); return query },
        eq() { return query },
        is() { return Promise.resolve({ error: null }) },
      }
      return query
    },
  }
  await upsertPrescanNotice(noticeClient, {
    accountId: "user-1",
    fileId: "file-1",
    outcome: "rejected",
    reasonCode: "csv_malformed",
    safeReason: "CSV is malformed.",
  })
  await resolvePrescanNotice(noticeClient, "file-1", "user-1")
  assert.equal(noticeWrites.length, 2)

  let retentionWrite: Record<string, unknown> | null = null
  let retentionConflict = ""
  const retentionClient = {
    from(table: string) {
      assert.equal(table, "prescan_file_retention")
      return {
        async upsert(value: Record<string, unknown>, options: { onConflict: string }) {
          retentionWrite = value
          retentionConflict = options.onConflict
          return { error: null }
        },
      }
    },
  }
  await upsertPrescanFileRetention(retentionClient, {
    accountId: "user-1",
    fileId: "file-1",
    outcome: "rejected",
    reasonCode: "csv_malformed",
    quarantinedAt: "2026-09-08T00:00:00.000Z",
  })
  assert.equal(retentionConflict, "file_id")
  assert.equal(retentionWrite?.bytes_expires_at, "2026-09-09T00:00:00.000Z")
  assert.equal(retentionWrite?.status, "retained")

  const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260908090000_prescan_lifecycle_and_evidence.sql"), "utf8")
  assert.match(migration, /'rejected'/)
  assert.match(migration, /'scan_failed'/)
  assert.match(migration, /revoke all on table public\.prescan_security_events from public, anon, authenticated/i)
  assert.match(migration, /grant select, insert on table public\.prescan_security_events to service_role/i)
  assert.match(migration, /grant select, update \(dismissed_at\) on table public\.prescan_rejection_notices to authenticated/i)

  const claimMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260908103000_prescan_claims_and_file_grants.sql"), "utf8")
  assert.match(claimMigration, /revoke update on table public\.files from authenticated/i)
  assert.match(claimMigration, /grant update \(filename, folder_id, analysis_json\) on table public\.files to authenticated/i)
  assert.match(claimMigration, /revoke insert on table public\.files from authenticated/i)
  assert.match(claimMigration, /browser uploads must enter the private inbox/i)
  assert.match(claimMigration, /new\.upload_status := 'pending_scan'/)
  assert.match(claimMigration, /new\.document_type := 'unknown'/)
  assert.match(claimMigration, /revoke execute on function public\.avint_enforce_browser_file_ingress\(\)/i)

  const batchMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260908130000_add_file_upload_batch_identity.sql"), "utf8")
  assert.match(batchMigration, /add column if not exists upload_batch_id uuid/i)
  assert.match(batchMigration, /new\.upload_batch_id := coalesce\(new\.upload_batch_id, gen_random_uuid\(\)\)/i)
  assert.match(batchMigration, /revoke insert, update on table public\.files from public, anon, authenticated/i)
  assert.match(batchMigration, /folder_id,[\s\S]{0,40}upload_batch_id[\s\S]{0,60}\) on table public\.files to authenticated/i)

  const retentionMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260908150000_add_security_retention_and_admin_audit.sql"), "utf8")
  assert.match(retentionMigration, /evidence_hold_at timestamptz/)
  assert.match(retentionMigration, /where status = 'retained' and evidence_hold_at is null/i)
  assert.match(retentionMigration, /revoke update, delete, truncate on table public\.prescan_security_events from service_role/i)
  assert.match(retentionMigration, /grant select, insert on table public\.prescan_admin_audit_events to service_role/i)
  assert.match(retentionMigration, /new\.canonical_payload := \(to_jsonb\(new\) - array\['canonical_payload', 'event_hash'\]\)::text/i)
  assert.match(retentionMigration, /pg_advisory_xact_lock/)

  const evidenceGrantMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260908153000_enforce_append_only_security_evidence_grants.sql"), "utf8")
  assert.match(evidenceGrantMigration, /revoke all on table public\.prescan_security_events from service_role/i)
  assert.match(evidenceGrantMigration, /grant select, insert on table public\.prescan_security_events to service_role/i)
  assert.match(evidenceGrantMigration, /revoke all on table public\.prescan_admin_audit_events from service_role/i)
  assert.match(evidenceGrantMigration, /grant select, insert on table public\.prescan_admin_audit_events to service_role/i)

  const source = readFileSync(join(process.cwd(), "supabase/functions/prescan-document/index.ts"), "utf8")
  assert.match(source, /claimPrescanFile\(supabase, file_id, userId\)/)
  assert.match(source, /eventType: "prescan\.action_intended"/)
  assert.match(source, /eventType: "prescan\.approved"/)
  assert.match(source, /EdgeRuntime\.waitUntil\(chain\)/)
  assert.ok(source.indexOf("sha = await sha256Hex(bytes)") < source.indexOf("analyzePdf(bytes)"), "hash must precede structural rejection")
  assert.match(source, /upload_status: outcome,[\s\S]{0,100}sha256: evidence\.sha256/)
  assert.match(source, /prescan_claimed_at: null/)

  const reconciler = readFileSync(join(process.cwd(), "lib/storage-reconciliation-server.ts"), "utf8")
  assert.match(reconciler, /\.eq\("upload_status", "scanning"\)/)
  assert.match(reconciler, /\.lt\("prescan_claimed_at", staleBefore\)/)
  assert.match(reconciler, /reconciled_after_runtime_termination/)
  assert.match(reconciler, /quarantine_retention_reconciled/)
  assert.match(reconciler, /\.is\("evidence_hold_at", null\)/)
  assert.match(reconciler, /status: "deleting"/)

  const holdRoute = readFileSync(join(process.cwd(), "app/api/systems/security/quarantine/[fileId]/hold/route.ts"), "utf8")
  const rescanRoute = readFileSync(join(process.cwd(), "app/api/systems/security/quarantine/[fileId]/rescan/route.ts"), "utf8")
  const exportRoute = readFileSync(join(process.cwd(), "app/api/systems/security/export/route.ts"), "utf8")
  for (const route of [holdRoute, rescanRoute, exportRoute]) {
    assert.match(route, /getSystemAdminUser/)
    assert.match(route, /checkRateLimit/)
    assert.match(route, /recordSecurityAdminAudit/)
  }
  assert.match(rescanRoute, /Release the investigation hold before requesting a re-scan/)
  assert.match(rescanRoute, /functions\/v1\/prescan-document/)
  assert.doesNotMatch(rescanRoute, /process-document/)
  assert.match(exportRoute, /admin_audit_events/)
  assert.match(exportRoute, /external signed checkpointing and legal process review are not yet complete/i)

  const browserUpload = readFileSync(join(process.cwd(), "app/tools/smart-storage/page.tsx"), "utf8")
  const serverUpload = readFileSync(join(process.cwd(), "lib/smart-storage-ingest.ts"), "utf8")
  assert.match(browserUpload, /upload_status: "pending_scan"/)
  assert.match(browserUpload, /upload_batch_id: uploadBatchId/)
  assert.match(serverUpload, /upload_status: "pending_scan"/)
  assert.match(serverUpload, /upload_batch_id: uploadBatchId/)
  assert.doesNotMatch(`${browserUpload}\n${serverUpload}`, /upload_status:\s*["']uploaded["']/)

  console.log("prescan lifecycle contract: passed", JSON.stringify(fixture.state))
}

void main()
