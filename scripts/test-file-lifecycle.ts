import assert from "node:assert/strict"
import { isStalledUpload, STALLED_UPLOAD_AGE_MS, validateBulkFileIds, MAX_BULK_DELETE_FILES } from "../lib/file-lifecycle"

const now = Date.parse("2026-09-01T12:00:00.000Z")
const old = new Date(now - STALLED_UPLOAD_AGE_MS).toISOString()
const recent = new Date(now - STALLED_UPLOAD_AGE_MS + 1).toISOString()

assert.equal(validateBulkFileIds(["a", "b"]).ok, true)
assert.equal(validateBulkFileIds(Array.from({ length: MAX_BULK_DELETE_FILES + 1 }, (_, i) => String(i))).ok, false)
assert.equal(validateBulkFileIds(["a", "a"]).ok, false)
assert.equal(isStalledUpload({ uploadStatus: "processing", createdAt: old, hasExtraction: false, now }), true)
assert.equal(isStalledUpload({ uploadStatus: "processing", createdAt: recent, hasExtraction: false, now }), false)
assert.equal(isStalledUpload({ uploadStatus: "processing", createdAt: old, hasExtraction: true, now }), false)
console.log("file lifecycle pure tests passed")
