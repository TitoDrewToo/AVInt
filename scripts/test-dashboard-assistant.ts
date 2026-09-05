import assert from "node:assert/strict"

import { fallbackDashboardAssistantResult, validateDashboardAssistantModelResult } from "../lib/dashboard-assistant"

const proposal = fallbackDashboardAssistantResult("Show me a chart by document type", 12, 4)
assert.equal(proposal.mode, "visual")
assert.equal(proposal.proposal?.definition.source.kind, "records")
assert.ok(validateDashboardAssistantModelResult(proposal))

const answer = fallbackDashboardAssistantResult("How much data is available?", 12, 4)
assert.equal(answer.mode, "answer")
assert.ok(validateDashboardAssistantModelResult(answer))

assert.equal(validateDashboardAssistantModelResult({ mode: "answer", answer: "" }), null)
assert.equal(validateDashboardAssistantModelResult({ ...proposal, proposal: { ...proposal.proposal, definition: { ...(proposal.proposal?.definition ?? {}), dimension: { field: "bad field" } } } }), null)
assert.equal(validateDashboardAssistantModelResult({ ...proposal, proposal: { ...proposal.proposal, widget_type: "pie-chart" } }), null)

console.log("dashboard assistant contracts: ok")
