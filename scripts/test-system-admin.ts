import { isErrorGroupFingerprint, isErrorGroupStatus } from "../lib/system-admin"

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

assert("Accepts every Phase 2 group status", ["new", "triaged", "resolved", "ignored"].every(isErrorGroupStatus))
assert("Rejects unsupported group statuses", !isErrorGroupStatus("diagnosed") && !isErrorGroupStatus(null))
assert("Accepts bounded fingerprints", isErrorGroupFingerprint("err_abcdef12"))
assert("Rejects malformed or oversized fingerprints", !isErrorGroupFingerprint("../../system") && !isErrorGroupFingerprint("x".repeat(129)))
console.log("4 passed, 0 failed")
