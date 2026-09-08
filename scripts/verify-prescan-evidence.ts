import { readFileSync } from "node:fs"

import { verifyAdminAuditEvidence, verifyPrescanEvidence, type PrescanEvidenceRow, type SealedEvidenceRow } from "../lib/prescan-evidence-verifier"

const path = process.argv[2]
if (!path) throw new Error("Usage: npx tsx scripts/verify-prescan-evidence.ts <evidence-export.json>")
const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
const envelope = Array.isArray(parsed) ? { events: parsed, admin_audit_events: [] } : parsed as { events?: unknown; admin_audit_events?: unknown }
const rows = envelope.events
if (!Array.isArray(rows)) throw new Error("Evidence export must be an array or an object containing an events array.")
const auditRows = envelope.admin_audit_events ?? []
if (!Array.isArray(auditRows)) throw new Error("admin_audit_events must be an array when present.")

console.log(JSON.stringify({
  valid: true,
  prescan: verifyPrescanEvidence(rows as PrescanEvidenceRow[]),
  administrator_audit: verifyAdminAuditEvidence(auditRows as SealedEvidenceRow[]),
}))
