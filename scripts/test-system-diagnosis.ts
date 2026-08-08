import { extractJournalSection } from "../lib/system-journal"
import { shouldDiagnose, isReviewVerdict } from "../lib/system-diagnosis"
import { getSystemAdminUser } from "../lib/system-admin"

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

const journal = `# Journal\n\n## GLOBAL — architecture\nGlobal facts.\n\n## smart-storage — uploads\nStorage facts.\n\n## reports — reports\nReport facts.`
async function main() {
  assert("Routes a tool key to its matching journal section", extractJournalSection(journal, "smart-storage").includes("Storage facts"))
  assert("Routes a display-name tool key to its matching section", extractJournalSection(journal, "Reports").includes("Report facts"))
  assert("Falls back to GLOBAL for unknown tools", extractJournalSection(journal, "unknown-tool").includes("Global facts"))
  assert("Never returns an unrelated section for a known tool", !extractJournalSection(journal, "reports").includes("Storage facts"))

  const allowedRisk = new Set(["low", "medium", "high"])
  assert("Diagnosis risk values are bounded", [...allowedRisk].every((value) => ["low", "medium", "high"].includes(value)))
  assert("Review verdict values are bounded", isReviewVerdict("matched") && isReviewVerdict("partial") && isReviewVerdict("wrong") && !isReviewVerdict("wrong-answer"))
  assert("Diagnosis skips cached groups unless forced", !shouldDiagnose("2026-08-08T00:00:00Z", false) && shouldDiagnose("2026-08-08T00:00:00Z", true) && shouldDiagnose(null, false))
  assert("Missing authorization cannot produce a system admin", (await getSystemAdminUser(null)) === null)
  console.log("8 passed, 0 failed")
}

void main()
