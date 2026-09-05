import assert from "node:assert/strict"
import fs from "node:fs"

import { dashboardPageId, dashboardPageName, dashboardPageOrder, dashboardPageSlug } from "../lib/dashboard-page-contract"

assert.equal(dashboardPageName("  Project   Atlas  "), "Project Atlas")
assert.throws(() => dashboardPageName(""), /1–80/)
assert.throws(() => dashboardPageName("x".repeat(81)), /1–80/)
assert.equal(dashboardPageSlug("Tax Year 2026"), "tax-year-2026")
assert.equal(dashboardPageSlug("Crème & Revenue"), "creme-revenue")
assert.equal(dashboardPageSlug("🎯"), "dashboard")
const first = "8cf0da8b-8ad3-4f44-9ce4-412aa5bc5523"
const second = "dfdb9c6c-37bf-4cd4-9c2a-5c869f9e35b8"
assert.equal(dashboardPageId(first), first)
assert.deepEqual(dashboardPageOrder([first, second]), [first, second])
assert.throws(() => dashboardPageOrder([first, first]), /duplicate/)
assert.throws(() => dashboardPageOrder(["not-an-id"]), /invalid/)

const mcp = fs.readFileSync("app/api/mcp/[[...transport]]/route.ts", "utf8")
for (const tool of ["list_pages", "create_page", "update_page", "delete_page"]) assert.match(mcp, new RegExp(`smart_dashboard\\.${tool}`))
assert.doesNotMatch(mcp, /page_slug: z\.string\(\)\.min\(1\)\.max\(80\)\.optional\(\)\.default\("personal"\)/)

console.log("dashboard page contracts: 16 passed")
