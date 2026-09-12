import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { processingStateAllowed } from "../supabase/functions/_shared/processing-access"
import { collaborationAvailable } from "../lib/collaboration-rollout"

for (const status of ["uploaded", "pending_scan", "scan_failed", "quarantined", "rejected", "done", "normalized", "processing", "approved"]) {
  for (const service of [false, true]) {
    assert.equal(processingStateAllowed(status, false, service), status === "approved")
    assert.equal(processingStateAllowed(status, true, service), service && status === "processing")
  }
}
const processor = readFileSync("supabase/functions/process-document/index.ts", "utf8")
assert.equal(processor.includes("sample_first_row"), false)
assert.equal(processor.includes("Failed to parse extraction output: ${rawText}"), false)
for (const fn of ["normalize-document", "reprocess-documents"]) {
  assert.equal(readFileSync(`supabase/functions/${fn}/index.ts`, "utf8").includes("Failed to parse AI output: ${rawText}"), false)
}
assert.equal(processor.match(/rpc\("avint_claim_document_processing"/g)?.length, 1)
assert.ok(processor.indexOf('rpc("avint_claim_document_processing"') < processor.indexOf(".download(file.storage_path)"))
assert.ok(processor.indexOf("if (isReprocess && !isServiceRole)") < processor.indexOf("const ensuredExtraction"))
assert.equal(collaborationAvailable(), false)
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(join(dir, entry.name)) : entry.name === "route.ts" ? [join(dir, entry.name)] : [])
}
for (const route of routes("app/api/collaboration")) {
  assert.match(readFileSync(route, "utf8"), /export async function POST[^\n]+\{\n  if \(!collaborationAvailable\(\)\) return collaborationUnavailableResponse\(\)/, route)
}
assert.match(readFileSync("lib/collaboration-access.ts", "utf8"), /if \(!collaborationAvailable\(\)\) return/)
console.log("Readiness boundary policy and wiring tests passed (not live integration tests)")
