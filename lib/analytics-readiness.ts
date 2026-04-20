import type { AdvancedAnalyticsFamily } from "./advanced-analytics-config"
import {
  ADVANCED_ANALYTICS_FAMILIES,
  getEnabledAnalyticsFamilies,
} from "./advanced-analytics-config"

// Bump when the signature shape changes materially. Older persisted signatures
// are still comparable on any axis both versions share; axes missing from an
// older signature are treated as zero/false (see `normalizeSignature`).
export const CORPUS_SIGNATURE_VERSION = 1

export interface CorpusSignature {
  v: number
  fieldsCount: number
  monthSpan: number
  uniqueVendors: number
  uniqueCategories: number
  uniqueDomains: number
  uniqueRegions: number
  hasRecurrence: boolean
  hasLineItemUnits: boolean
}

// Minimal row shape used for signature computation. Kept optional so the same
// compute path works before and after Phase 1 schema enrichment ships — fields
// that do not exist yet simply contribute zero/false.
export interface SignatureRow {
  document_date?: string | null
  vendor_normalized?: string | null
  expense_category?: string | null
  merchant_domain?: string | null
  merchant_address_region?: string | null
  is_recurring?: boolean | null
  line_items?: unknown
}

export function computeCorpusSignature(rows: SignatureRow[]): CorpusSignature {
  const months = new Set<string>()
  const vendors = new Set<string>()
  const categories = new Set<string>()
  const domains = new Set<string>()
  const regions = new Set<string>()
  let hasRecurrence = false
  let hasLineItemUnits = false

  for (const row of rows) {
    if (row.document_date) months.add(row.document_date.slice(0, 7))
    if (row.vendor_normalized) vendors.add(row.vendor_normalized)
    if (row.expense_category) categories.add(row.expense_category)
    if (row.merchant_domain) domains.add(row.merchant_domain)
    if (row.merchant_address_region) regions.add(row.merchant_address_region)
    if (row.is_recurring === true) hasRecurrence = true
    if (!hasLineItemUnits && Array.isArray(row.line_items)) {
      for (const item of row.line_items as unknown[]) {
        if (
          item &&
          typeof item === "object" &&
          ((item as Record<string, unknown>).unit_quantity != null ||
            (item as Record<string, unknown>).quantity != null)
        ) {
          hasLineItemUnits = true
          break
        }
      }
    }
  }

  return {
    v: CORPUS_SIGNATURE_VERSION,
    fieldsCount: rows.length,
    monthSpan: months.size,
    uniqueVendors: vendors.size,
    uniqueCategories: categories.size,
    uniqueDomains: domains.size,
    uniqueRegions: regions.size,
    hasRecurrence,
    hasLineItemUnits,
  }
}

// Accept anything shaped like a signature (including older versions from the
// DB) and project it onto the current schema. Unknown axes become zero/false.
export function normalizeSignature(raw: unknown): CorpusSignature | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  const bool = (v: unknown) => v === true
  return {
    v: num(s.v) || 1,
    fieldsCount: num(s.fieldsCount),
    monthSpan: num(s.monthSpan),
    uniqueVendors: num(s.uniqueVendors),
    uniqueCategories: num(s.uniqueCategories),
    uniqueDomains: num(s.uniqueDomains),
    uniqueRegions: num(s.uniqueRegions),
    hasRecurrence: bool(s.hasRecurrence),
    hasLineItemUnits: bool(s.hasLineItemUnits),
  }
}

export type UnlockAxis = "months" | "transactions" | "vendors" | "categories"

export interface UnlockHint {
  familyId: string
  familyLabel: string
  axis: UnlockAxis
  current: number
  required: number
  gap: number
}

export type ReadinessState =
  | { kind: "empty" }
  | { kind: "sparse"; nextUnlocks: UnlockHint[] }
  | { kind: "unlock_moment"; unlocked: string[]; nextUnlocks: UnlockHint[] }
  | { kind: "new_signal"; changedAxes: string[]; nextUnlocks: UnlockHint[] }
  | { kind: "stable"; nextUnlocks: UnlockHint[] }

function isFamilyUnlocked(
  family: AdvancedAnalyticsFamily,
  sig: CorpusSignature,
): boolean {
  if (family.minMonths && sig.monthSpan < family.minMonths) return false
  if (family.minTransactions && sig.fieldsCount < family.minTransactions) return false
  if (family.minCategories && sig.uniqueCategories < family.minCategories) return false
  if (family.minVendors && sig.uniqueVendors < family.minVendors) return false
  return true
}

function findNextUnlocks(sig: CorpusSignature, limit = 3): UnlockHint[] {
  const hints: UnlockHint[] = []
  for (const family of ADVANCED_ANALYTICS_FAMILIES) {
    if (family.status !== "enabled") continue
    if (isFamilyUnlocked(family, sig)) continue

    const candidates: UnlockHint[] = []
    if (family.minMonths && sig.monthSpan < family.minMonths) {
      candidates.push({
        familyId: family.id, familyLabel: family.label, axis: "months",
        current: sig.monthSpan, required: family.minMonths,
        gap: family.minMonths - sig.monthSpan,
      })
    }
    if (family.minTransactions && sig.fieldsCount < family.minTransactions) {
      candidates.push({
        familyId: family.id, familyLabel: family.label, axis: "transactions",
        current: sig.fieldsCount, required: family.minTransactions,
        gap: family.minTransactions - sig.fieldsCount,
      })
    }
    if (family.minCategories && sig.uniqueCategories < family.minCategories) {
      candidates.push({
        familyId: family.id, familyLabel: family.label, axis: "categories",
        current: sig.uniqueCategories, required: family.minCategories,
        gap: family.minCategories - sig.uniqueCategories,
      })
    }
    if (family.minVendors && sig.uniqueVendors < family.minVendors) {
      candidates.push({
        familyId: family.id, familyLabel: family.label, axis: "vendors",
        current: sig.uniqueVendors, required: family.minVendors,
        gap: family.minVendors - sig.uniqueVendors,
      })
    }

    candidates.sort((a, b) => a.gap - b.gap)
    if (candidates[0]) hints.push(candidates[0])
  }
  hints.sort((a, b) => a.gap - b.gap)
  return hints.slice(0, limit)
}

function changedAxesBetween(
  current: CorpusSignature,
  last: CorpusSignature,
): string[] {
  const changes: string[] = []
  if (current.fieldsCount !== last.fieldsCount) changes.push("documents")
  if (current.monthSpan !== last.monthSpan) changes.push("months")
  if (current.uniqueVendors !== last.uniqueVendors) changes.push("vendors")
  if (current.uniqueCategories !== last.uniqueCategories) changes.push("categories")
  if (current.uniqueDomains !== last.uniqueDomains) changes.push("merchant domains")
  if (current.uniqueRegions !== last.uniqueRegions) changes.push("regions")
  if (current.hasRecurrence !== last.hasRecurrence) changes.push("recurrence")
  if (current.hasLineItemUnits !== last.hasLineItemUnits) changes.push("line-item units")
  return changes
}

export function evaluateReadiness(
  current: CorpusSignature,
  last: CorpusSignature | null,
): ReadinessState {
  const nextUnlocks = findNextUnlocks(current)

  if (current.fieldsCount === 0) return { kind: "empty" }

  if (!last) {
    const anyUnlocked = getEnabledAnalyticsFamilies().some((f) =>
      isFamilyUnlocked(f, current),
    )
    if (!anyUnlocked) return { kind: "sparse", nextUnlocks }
    return { kind: "stable", nextUnlocks }
  }

  const unlocked: string[] = []
  for (const family of getEnabledAnalyticsFamilies()) {
    if (!isFamilyUnlocked(family, last) && isFamilyUnlocked(family, current)) {
      unlocked.push(family.label)
    }
  }
  if (unlocked.length > 0) return { kind: "unlock_moment", unlocked, nextUnlocks }

  const changedAxes = changedAxesBetween(current, last)
  if (changedAxes.length > 0) return { kind: "new_signal", changedAxes, nextUnlocks }

  return { kind: "stable", nextUnlocks }
}

// Formats an UnlockHint into concise motivating copy. Used by the dashboard
// trigger and any future readiness surface.
export function describeUnlockHint(hint: UnlockHint): string {
  const noun =
    hint.axis === "months"
      ? hint.gap === 1 ? "1 more month" : `${hint.gap} more months`
      : hint.axis === "transactions"
      ? hint.gap === 1 ? "1 more document" : `${hint.gap} more documents`
      : hint.axis === "vendors"
      ? hint.gap === 1 ? "1 more vendor" : `${hint.gap} more vendors`
      : hint.gap === 1 ? "1 more category" : `${hint.gap} more categories`
  return `${noun} unlocks ${hint.familyLabel.toLowerCase()}`
}
