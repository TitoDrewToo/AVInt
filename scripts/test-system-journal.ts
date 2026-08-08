import assert from "node:assert/strict"
import { JOURNAL_CHAR_BUDGET, nextTimeWindow, nextTopicScope, selectJournalContext, shouldEscalateDiagnosis } from "../lib/system-journal"

const journal = [
  "## GLOBAL — architecture",
  "global ".repeat(1800),
  "## billing — billing",
  "billing details",
  "## smart-storage — storage",
  "storage details",
  "## reports — reports",
  "reports details",
  "## TIMELINE",
  "- 2026-08-08 · deploy · smart-storage · Fresh release",
  "- 2026-08-01 · deploy · billing · Older release",
].join("\n")

const fresh = selectJournalContext(
  { occurred_at: "2026-08-08T04:00:00Z", tool: "smart-storage", fn: "smart-storage-upload", route: "/tools/smart-storage" },
  { first_seen: "2026-08-08T04:00:00Z", last_seen: "2026-08-08T04:00:00Z" },
  journal,
)
assert.equal(fresh.timeWindow, "day")
assert.equal(fresh.topicScope, "narrow")

const billing = selectJournalContext(
  { occurred_at: "2026-08-08T04:00:00Z", tool: "billing", fn: "billing-webhook", route: "/api/billing", severity: "high" },
  { first_seen: "2026-08-08T04:00:00Z" },
  journal,
)
assert.equal(billing.topicScope, "related")

const old = selectJournalContext(
  { occurred_at: "2026-08-08T04:00:00Z", tool: "smart-storage", fn: "smart-storage", route: "/tools/smart-storage" },
  { first_seen: "2026-06-01T04:00:00Z" },
  journal,
)
assert.equal(old.timeWindow, "all")
assert.equal(old.topicScope, "narrow")

const cross = selectJournalContext(
  { occurred_at: "2026-08-08T04:00:00Z", tool: "billing", fn: "reports-generator", route: "/reports/tax", severity: "high" },
  { first_seen: "2026-08-08T04:00:00Z" },
  journal,
)
assert.equal(cross.timeWindow, "all")
assert.equal(cross.topicScope, "full")
assert.ok(fresh.text.length <= JOURNAL_CHAR_BUDGET)
assert.ok(billing.text.length <= JOURNAL_CHAR_BUDGET)
assert.ok(old.text.length <= JOURNAL_CHAR_BUDGET)
assert.ok(cross.text.length <= JOURNAL_CHAR_BUDGET)

let calls = 0
let time = fresh.timeWindow
let topic = fresh.topicScope
const firstPass = { confidence: 0.2, needs_more: { topic: true } }
calls++
if (shouldEscalateDiagnosis(firstPass)) {
  topic = nextTopicScope(topic)
  calls++
}
assert.equal(calls, 2)
assert.equal(time, "day")
assert.equal(topic, "related")
assert.equal(nextTimeWindow("day"), "week")
console.log("system journal selector tests passed")
