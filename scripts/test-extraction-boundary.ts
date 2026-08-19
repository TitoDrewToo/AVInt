import assert from "node:assert/strict"
import { asExtractedDocumentRows, ExtractionShapeError } from "../supabase/functions/_shared/extraction-boundary"

assert.deepEqual(asExtractedDocumentRows([{ vendor_name: "Acme" }]), [{ vendor_name: "Acme" }])
assert.deepEqual(asExtractedDocumentRows([]), [])
assert.throws(() => asExtractedDocumentRows({ vendor_name: "Acme" }), ExtractionShapeError)
assert.throws(() => asExtractedDocumentRows([null]), /row 1 is not an object/)
assert.throws(() => asExtractedDocumentRows([["not", "a", "document"]]), /row 1 is not an object/)

console.log("extraction boundary tests: 5 passed")
