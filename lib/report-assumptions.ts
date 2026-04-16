export type ReportAssumptionScope = "business_expense"
export type FilingContext = "self_employed" | "employed"

export interface BusinessExpenseAssumptions {
  filing_context: FilingContext
  federal_marginal_rate: number
  state_marginal_rate: number
  include_self_employment_tax: boolean
  self_employment_tax_rate: number
  notes: string
}

export const BUSINESS_EXPENSE_SCOPE: ReportAssumptionScope = "business_expense"

export function getDefaultBusinessExpenseAssumptions(
  filingContext: FilingContext = "self_employed",
): BusinessExpenseAssumptions {
  if (filingContext === "employed") {
    return {
      filing_context: "employed",
      federal_marginal_rate: 22,
      state_marginal_rate: 0,
      include_self_employment_tax: false,
      self_employment_tax_rate: 15.3,
      notes: "",
    }
  }

  return {
    filing_context: "self_employed",
    federal_marginal_rate: 22,
    state_marginal_rate: 0,
    include_self_employment_tax: true,
    self_employment_tax_rate: 15.3,
    notes: "",
  }
}

export function normalizeBusinessExpenseAssumptions(
  input: Partial<BusinessExpenseAssumptions> | null | undefined,
): BusinessExpenseAssumptions {
  const fallback = getDefaultBusinessExpenseAssumptions(
    input?.filing_context === "employed" ? "employed" : "self_employed",
  )

  const clampRate = (value: unknown, fallbackValue: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallbackValue
    return Math.max(0, Math.min(100, n))
  }

  return {
    filing_context: input?.filing_context === "employed" ? "employed" : fallback.filing_context,
    federal_marginal_rate: clampRate(input?.federal_marginal_rate, fallback.federal_marginal_rate),
    state_marginal_rate: clampRate(input?.state_marginal_rate, fallback.state_marginal_rate),
    include_self_employment_tax: typeof input?.include_self_employment_tax === "boolean"
      ? input.include_self_employment_tax
      : fallback.include_self_employment_tax,
    self_employment_tax_rate: clampRate(input?.self_employment_tax_rate, fallback.self_employment_tax_rate),
    notes: typeof input?.notes === "string" ? input.notes : fallback.notes,
  }
}

export function getBusinessExpenseEffectiveRate(
  assumptions: BusinessExpenseAssumptions,
): number {
  return assumptions.federal_marginal_rate
    + assumptions.state_marginal_rate
    + (assumptions.include_self_employment_tax ? assumptions.self_employment_tax_rate : 0)
}
