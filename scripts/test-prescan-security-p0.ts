import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { findKnownQuarantinedFile, parsePrescanSafetyJson } from "../supabase/functions/_shared/prescan-security"

type EqCall = { column: string; value: unknown }

function mockFilesQuery(result: { data: unknown; error: unknown }) {
  const eqCalls: EqCall[] = []
  const query = {
    select() { return query },
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value })
      return query
    },
    limit() { return query },
    async maybeSingle() { return result },
  }
  return {
    client: {
      from(table: string) {
        assert.equal(table, "files")
        return query
      },
    },
    eqCalls,
  }
}

async function main() {
  const match = { id: "file-existing", scan_reason: "pdf_active_content: JavaScript action" }
  const { client, eqCalls } = mockFilesQuery({ data: match, error: null })
  const result = await findKnownQuarantinedFile(client, "user-a", "sha-123")

  assert.deepEqual(result, match)
  assert.deepEqual(eqCalls, [
    { column: "user_id", value: "user-a" },
    { column: "sha256", value: "sha-123" },
    { column: "upload_status", value: "quarantined" },
  ])

  const missing = mockFilesQuery({ data: null, error: null })
  assert.equal(await findKnownQuarantinedFile(missing.client, "user-b", "sha-456"), null)

  const failed = mockFilesQuery({ data: null, error: { message: "query failed" } })
  await assert.rejects(
    findKnownQuarantinedFile(failed.client, "user-c", "sha-789"),
    /Known-quarantined-hash lookup failed: query failed/,
  )

  assert.deepEqual(parsePrescanSafetyJson("test", '```json\n{"is_processable":true,"doc_category":"receipt","confidence":0.95,"abuse_flag":false,"reason":""}\n```'), {
    is_processable: true,
    doc_category: "receipt",
    confidence: 0.95,
    abuse_flag: false,
    reason: "",
  })
  assert.throws(
    () => parsePrescanSafetyJson("test", '{"is_processable":"true","doc_category":"receipt","confidence":0.95,"abuse_flag":false,"reason":""}'),
    /failed to parse a valid decision/,
  )
  assert.throws(
    () => parsePrescanSafetyJson("test", '{"is_processable":true,"doc_category":"receipt","confidence":"unknown","abuse_flag":false,"reason":""}'),
    /failed to parse a valid decision/,
  )
  assert.equal(parsePrescanSafetyJson("test", '{"is_processable":true,"doc_category":"operational_data","confidence":0.9,"abuse_flag":false,"reason":""}').doc_category, "operational_data")

  const root = process.cwd()
  const prescanSource = readFileSync(join(root, "supabase/functions/prescan-document/index.ts"), "utf8")
  for (const retiredName of [
    "SMART_SECURITY_URL",
    "SMART_SECURITY_API_KEY",
    "SMART_SECURITY_REQUIRED",
    "runSmartSecurityScan",
    "/v1/scan/file",
  ]) {
    assert.equal(prescanSource.includes(retiredName), false, `${retiredName} must not remain in prescan`)
  }

  assert.equal(existsSync(join(root, "app/api/smart-security/health/route.ts")), false)
  const retiredScaffold = join(root, "smart-security")
  const remainingScaffoldFiles = existsSync(retiredScaffold)
    ? readdirSync(retiredScaffold, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    : []
  assert.equal(remainingScaffoldFiles.length, 0)

  console.log("prescan security P0 contract: passed")
}

void main()
