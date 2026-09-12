import assert from "node:assert/strict"
import { boundedFormData, UploadBodyTooLargeError } from "../lib/bounded-form-data"

async function main() {
  const form = new FormData()
  form.set("workflow_id", "fixture")
  form.set("files", new Blob(["test"], { type: "text/plain" }), "test.txt")
  // Serialize the fixture first: Node 25's generated FormData stream can throw
  // outside its promise when cancelled. Incoming HTTP bodies are raw bytes.
  const encoded = new Request("https://fixture.invalid", { method: "POST", body: form })
  const contentType = encoded.headers.get("content-type")!
  const bytes = await encoded.arrayBuffer()
  const request = () => new Request("https://fixture.invalid", { method: "POST", body: bytes.slice(0), headers: { "content-type": contentType } })
  const parsed = await boundedFormData(request(), 4096)
  assert.equal(parsed.get("workflow_id"), "fixture")
  assert.equal(await (parsed.get("files") as File).text(), "test")
  await assert.rejects(boundedFormData(request(), 10), UploadBodyTooLargeError)
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(12)) },
    cancel() { cancelled = true },
  })
  const dishonest = new Request("https://fixture.invalid", { method: "POST", body: stream, duplex: "half", headers: { "content-length": "1" } } as RequestInit)
  await assert.rejects(boundedFormData(dishonest, 20), UploadBodyTooLargeError)
  assert.equal(cancelled, true)
  const oversized = request()
  oversized.headers.set("content-length", "999999")
  await assert.rejects(boundedFormData(oversized, 4096), UploadBodyTooLargeError)
  await assert.rejects(boundedFormData(new Request("https://fixture.invalid"), 4096), /Missing upload body/)
  console.log("Bounded multipart tests passed: valid upload, absent/false/oversized length, stream cancellation")
}
void main()
