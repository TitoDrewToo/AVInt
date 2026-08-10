#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), "utf8")

const checks = []
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail })
}

function includes(file, needle) {
  return read(file).includes(needle)
}

function matches(file, regex) {
  return regex.test(read(file))
}

const core = "lib/tax-bundle.ts"
const selfEmployedPage = "app/tools/smart-storage/reports/tax-bundle/page.tsx"
const employedPage = "app/tools/smart-storage/reports/tax-bundle/employed/page.tsx"
const testFile = "scripts/test-tax-bundle.ts"

for (const file of [core, selfEmployedPage, employedPage, testFile]) {
  check(`file exists: ${file}`, fs.existsSync(path.join(root, file)))
}

if (fs.existsSync(path.join(root, core))) {
  check("meals ratio remains 50%", matches(core, /MEALS_DEDUCTIBLE_RATIO\s*=\s*0\.5/))
  check("Line 24b meals mapping exists", includes(core, 'line: "Line 24b"'))
  check("Line 27b fallback exists", includes(core, 'line: "Line 27b"'))
  check("Line 27a not used as general category mapping", !matches(core, /line:\s*"Line 27a"\s*,\s*label:\s*"(?!Energy)/))
  check("entertainment is not a mapped category", !matches(core, /categories:\s*\[[^\]]*Entertainment/i))
  check("Schedule C net uses self-employment base", includes(core, "const estimatedNetScheduleC = selfEmploymentGross - deductibleExpenses"))
  check("deductible total derives from scheduleC buckets", includes(core, "const deductibleExpenses = scheduleC.reduce"))
  check("uncategorized rows are separated", includes(core, "uncategorizedItems.push(r)"))
  check("mixed-currency warning exists in CSV", includes(core, "WARNING: Mixed currencies detected"))
  check("wage CSV copy says not offset", includes(core, "NOT offset by Schedule C"))
}

if (fs.existsSync(path.join(root, selfEmployedPage))) {
  check("self-employed page warns mixed currencies", includes(selfEmployedPage, "Mixed currencies detected"))
  check("self-employed page separates wage income", includes(selfEmployedPage, "Wage Income (informational only)"))
  check("self-employed page says not tax advice", includes(selfEmployedPage, "It is not tax advice"))
  check("self-employed page says not W-2 offset", includes(selfEmployedPage, "cannot be offset by business expenses"))
}

if (fs.existsSync(path.join(root, employedPage))) {
  check("employee worksheet says not W-2 substitute", includes(employedPage, "not a W-2 substitute"))
  check("employee worksheet excludes Schedule C deductions", includes(employedPage, "does not offset expenses against wages"))
  check("employee worksheet warns not withholding verification", includes(employedPage, "not withholding verification"))
}

if (fs.existsSync(path.join(root, testFile))) {
  check("tests cover mixed-income regression", includes(testFile, "mixed-income"))
  check("tests cover wage-only regression", includes(testFile, "wage-only"))
  check("tests cover mixed-currency", includes(testFile, "mixed-currency"))
  check("tests cover meals-heavy", includes(testFile, "meals-heavy"))
}

const failed = checks.filter((c) => !c.ok)
for (const c of checks) {
  const mark = c.ok ? "ok" : "FAIL"
  console.log(`${mark} - ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
}

if (failed.length) {
  console.error(`\n${failed.length} tax-bundle audit check(s) failed.`)
  process.exit(1)
}

console.log(`\nAll ${checks.length} tax-bundle audit checks passed.`)
