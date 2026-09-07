import assert from "node:assert/strict"

import { validateReportDefinitionPayload } from "@/lib/report-definitions"

/**
 * Contract for the title/period consistency rule added 7 Sep 2026.
 *
 * Observed defect: the authoring assistant was asked for "Total expenses by
 * vendor for 2026, highest first" and saved a definition titled exactly that
 * with period {kind:"all"} — a report labelled for a year while computing over
 * all time. CLAUDE.md prohibits labels overstating the underlying math, and
 * this is the dangerous shape of it: the title looks authoritative and the
 * number is plausible, so a user reconciling against their books finds a
 * discrepancy the report cannot explain.
 *
 * The rule lives in validateReportDefinitionPayload because that is the single
 * chokepoint every writer passes through — the authoring route, both store
 * paths (web and the MCP save_report_definition tool), and dashboard visuals.
 * Prompt engineering fixes the prompts we thought of; this fails closed for the
 * ones we did not.
 */

function definition(title: string, period: unknown) {
  return {
    title,
    description: "Test definition.",
    source: { kind: "records" },
    scope: null,
    period,
    filters: [],
    blocks: [{ type: "kpi", items: [{ label: "Matching records", metric: { aggregation: "count" } }] }],
    theme: null,
  }
}

const ALL = { kind: "all" }
const FIXED = { kind: "fixed", from: "2026-01-01", to: "2026-12-31" }
const ROLLING = { kind: "rolling", unit: "month", count: 12, offset: 0 }

function assertRejected(title: string, period: unknown, why: string) {
  const result = validateReportDefinitionPayload(definition(title, period))
  assert.equal(result.ok, false, `expected rejection: ${why} — ${title}`)
  if (!result.ok) assert.match(result.error, /names a period/, "rejection must explain the title/period mismatch")
}

function assertAccepted(title: string, period: unknown, why: string) {
  const result = validateReportDefinitionPayload(definition(title, period))
  assert.equal(result.ok, true,
    `expected acceptance: ${why} — ${title}${result.ok ? "" : ` (got: ${result.error})`}`)
}

function main() {
  // The exact defect observed in production.
  assertRejected("Total expenses by vendor for 2026, highest first", ALL,
    "a year in the title with an all-time period")

  // Other period claims a title can make.
  assertRejected("Q3 expense summary", ALL, "an explicit quarter")
  assertRejected("Expenses last month", ALL, "a relative span")
  assertRejected("Revenue year to date", ALL, "year-to-date")
  assertRejected("Spending YTD", ALL, "YTD abbreviation")

  // The same titles are fine once the definition actually scopes the period.
  assertAccepted("Total expenses by vendor for 2026, highest first", FIXED,
    "a year in the title with a fixed period is a true label")
  assertAccepted("Expenses last month", ROLLING,
    "a relative title with a rolling period is a true label")

  // False positives are worse than the bug — a validator that rejects honest
  // titles trains people to work around it. These must all pass.
  assertAccepted("Total expenses by vendor", ALL, "no period named")
  assertAccepted("Top 100 vendors by spend", ALL, "100 is not a year")
  assertAccepted("Expenses that may recur", ALL, "'may' is an ordinary word, not a month")
  assertAccepted("Q&A responses log", ALL, "Q& is not a quarter")
  assertAccepted("Contracts over 5000", ALL, "a plain number is not a year")
  assertAccepted("Vendor spend, all time", ALL, "'all time' is an honest description of all time")

  console.log("report definition title/period contract: 13 assertions passed")
}

main()
