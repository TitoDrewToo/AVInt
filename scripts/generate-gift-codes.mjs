#!/usr/bin/env node
/**
 * AVIntelligence — Gift Code Generator
 * Generates unlimited gift codes (expires 2099) and outputs a SQL INSERT
 * you can paste directly into the Supabase SQL editor.
 *
 * Usage:
 *   node scripts/generate-gift-codes.mjs            # 20 codes, AVINT-UNLIMITED prefix
 *   node scripts/generate-gift-codes.mjs 10          # 10 codes
 *   node scripts/generate-gift-codes.mjs 5 AVINT-VIP # custom prefix
 */

import { randomBytes } from "crypto"

const count  = parseInt(process.argv[2] ?? "20")
const prefix = (process.argv[3] ?? "AVINT-UNLIMITED").toUpperCase()

function generateCode(prefix, index) {
  // e.g. AVINT-UNLIMITED-A3F9B2
  const rand = randomBytes(3).toString("hex").toUpperCase()
  const seq  = String(index).padStart(2, "0")
  return `${prefix}-${seq}-${rand}`
}

const codes = Array.from({ length: count }, (_, i) => generateCode(prefix, i + 1))

// Print the codes
console.log(`\n✅ Generated ${count} unlimited gift codes (expires 2099)\n`)
console.log("─".repeat(60))
codes.forEach((c) => console.log(`  ${c}`))
console.log("─".repeat(60))

// Output SQL to paste into Supabase SQL editor
console.log("\n📋 Paste this into Supabase SQL Editor:\n")

const DURATION_HOURS = 867240 // 99 years

const rows = codes.map((code) =>
  `  ('${code}', 'active', 'monthly', '2099-12-31 00:00:00+00', ${DURATION_HOURS})`
).join(",\n")

const sql = `INSERT INTO gift_codes (code, status, plan, expires_at, duration_hours)
VALUES
${rows};`

console.log(sql)
console.log("\n")
