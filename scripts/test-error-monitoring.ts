import { createErrorFingerprint, occurredAtManila } from "../lib/error-fingerprint"
import { sanitizeErrorContext, sanitizeErrorString } from "../lib/error-sanitize"

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

const base = {
  tool: "Smart Storage",
  fn: "process-document",
  action: "extract",
  message: "Document 12345 failed for 550e8400-e29b-41d4-a716-446655440000",
}
const repeated = {
  ...base,
  message: "Document 98765 failed for 6ba7b810-9dad-41d1-80b4-00c04fd430c8",
}

assert("Same normalized error produces a stable fingerprint", createErrorFingerprint(base) === createErrorFingerprint(repeated))
assert("Different actions produce different fingerprints", createErrorFingerprint(base) !== createErrorFingerprint({ ...base, action: "upload" }))
assert("UTC converts to the same instant in Asia/Manila", occurredAtManila("2026-08-08T00:00:00.000Z") === "2026-08-08 08:00:00")
assert("Sanitization redacts full emails and bearer tokens", sanitizeErrorString("alice@example.com Bearer secret-token") === "[redacted-email] Bearer [redacted-token]")
const sanitized = sanitizeErrorContext({ document_content: "private", nested: { email: "alice@example.com" }, safe: "ok" }) as Record<string, unknown>
assert("Context sanitization removes document content and email values", sanitized.document_content === "[redacted]" && (sanitized.nested as Record<string, unknown>).email === "[redacted]")

type Event = { fingerprint: string; message: string }
const events: Event[] = []
const groups = new Map<string, { title: string; count: number }>()
function captureForTest(event: Event) {
  events.push(event)
  const current = groups.get(event.fingerprint)
  groups.set(event.fingerprint, current
    ? { ...current, count: current.count + 1 }
    : { title: event.message, count: 1 })
}

const fingerprint = createErrorFingerprint(base)
captureForTest({ fingerprint, message: base.message })
captureForTest({ fingerprint, message: repeated.message })
assert("Capture records an event and increments the matching group", events.length === 2 && groups.get(fingerprint)?.count === 2)
assert("Grouping keeps the first message as the title", groups.get(fingerprint)?.title === base.message)

console.log("7 passed, 0 failed")
