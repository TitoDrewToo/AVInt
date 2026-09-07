import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { classifyRow } from "@/lib/document-classification"

/**
 * Regression contract for the defect found 7 Sep 2026.
 *
 * `classifyRow` consults `direction` first and `income_source` second — both
 * correct, both added by CODEX_BRIEF_income_direction.md (3 Sep). But
 * `fetchDashboardReadyFields` did not select `direction` from `records` and did
 * not map `direction` or `income_source` into the row it returns. The
 * classifier was reading fields its own data source never supplied, so every
 * income row fell through to the csv_export fallback and became an expense.
 * The Smart Dashboard reported income as expense, overstating total expenses
 * by 2.95x on the reference account.
 *
 * The bug was invisible to a `classifyRow` unit test, because `classifyRow` was
 * never broken. It is only visible where the projection meets the classifier.
 * That seam is what this file tests.
 */

// Shaped exactly as fetchDashboardReadyFields emits a row, mirroring the three
// real income records on the reference account: direction 'inflow', an
// income_source attribute, and NO gross_income/net_income.
function projectedRow(overrides: Record<string, unknown> = {}) {
  return {
    file_id: "00000000-0000-0000-0000-000000000001",
    document_date: "2026-08-01",
    total_amount: 4200,
    direction: "inflow",
    income_source: "business",
    gross_income: null,
    net_income: null,
    expense_category: null,
    merchant_domain: null,
    currency: "USD",
    normalization_status: "normalized" as const,
    raw_json: null,
    vendor_normalized: null,
    merchant_address_region: null,
    is_recurring: false,
    line_items: [],
    files: { document_type: "csv_export", filename: "avint-demo-2026.csv", user_id: "u" },
    ...overrides,
  }
}

function main() {
  // 1. An inflow row classifies as income even with no gross_income attribute.
  assert.equal(classifyRow(projectedRow()), "income",
    "an inflow csv_export row must classify as income")

  // 2. income_source alone is enough when direction is absent.
  assert.equal(classifyRow(projectedRow({ direction: null })), "income",
    "income_source must classify as income when direction is null")

  // 3. Outflow still classifies as expense — no regression on the common path.
  assert.equal(
    classifyRow(projectedRow({ direction: "outflow", income_source: null, total_amount: 551.25 })),
    "expense",
    "an outflow csv_export row must classify as expense")

  // 4. The pre-fix shape misclassifies. This asserts the fields are
  //    load-bearing rather than decorative: strip them and income becomes
  //    expense, which is precisely the defect.
  const preFix = projectedRow()
  delete (preFix as Record<string, unknown>).direction
  delete (preFix as Record<string, unknown>).income_source
  assert.equal(classifyRow(preFix), "expense",
    "without direction and income_source the row misclassifies — the fields are required, not optional")

  // 5. Source contract. A behavioural test passes against a hand-built row even
  //    if the real projection stops supplying these fields, so assert the
  //    projection itself still selects and maps them.
  const source = readFileSync(join(process.cwd(), "lib/normalized-data-context.ts"), "utf8")
  const select = source.match(/\.select\(\s*"([^"]+)"/)
  assert.ok(select, "could not find the records .select() in fetchDashboardReadyFields")
  assert.match(select[1], /\bdirection\b/,
    "fetchDashboardReadyFields must select `direction` from records")
  assert.match(source, /\n\s*direction: record\.direction,/,
    "the projected row must map `direction`")
  assert.match(source, /\n\s*income_source: fields\.get\("income_source"\)/,
    "the projected row must map `income_source`")

  console.log("dashboard projection -> classification contract: 5 assertions passed")
}

main()
