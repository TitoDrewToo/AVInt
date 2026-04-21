#!/usr/bin/env node
/**
 * AVIntelligence — Gift Code Generator
 * Generates 24-hour day-pass gift codes and outputs a SQL INSERT
 * you can paste directly into the Supabase SQL editor.
 *
 * Usage:
 *   node scripts/generate-gift-codes.mjs            # 20 codes, AVINT-EARLY prefix
 *   node scripts/generate-gift-codes.mjs 10          # 10 codes
 *   node scripts/generate-gift-codes.mjs 5 AVINT-VIP # custom prefix
 */

import { randomBytes } from "crypto"

const count  = parseInt(process.argv[2] ?? "20")
const prefix = (process.argv[3] ?? "AVINT-EARLY").toUpperCase()
const expiresAt = process.argv[4] ?? "2026-06-30 23:59:59+00"

function generateCode(prefix, index) {
  // e.g. AVINT-EARLY-01-A3F9B2
  const rand = randomBytes(3).toString("hex").toUpperCase()
  const seq  = String(index).padStart(2, "0")
  return `${prefix}-${seq}-${rand}`
}

const codes = Array.from({ length: count }, (_, i) => generateCode(prefix, i + 1))

// Print the codes
console.log(`\nGenerated ${count} 24-hour day-pass gift codes (code expiry: ${expiresAt})\n`)
console.log("─".repeat(60))
codes.forEach((c) => console.log(`  ${c}`))
console.log("─".repeat(60))

// Output SQL to paste into Supabase SQL editor
console.log("\n📋 Paste this into Supabase SQL Editor:\n")

const DURATION_HOURS = 24

const rows = codes.map((code) =>
  `  ('${code}', 'pending', 'day_pass', ${DURATION_HOURS}, '${expiresAt}')`
).join(",\n")

const sql = `INSERT INTO gift_codes (code, status, plan, duration_hours, expires_at)
VALUES
${rows};`

console.log(sql)
console.log("\n")
