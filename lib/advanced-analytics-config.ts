export type AdvancedAnalyticsKind =
  | "core_family"
  | "visual_variant"
  | "implementation_pattern"

export type AdvancedAnalyticsStatus = "enabled" | "planned"

export type AdvancedWidgetType =
  | "line-chart"
  | "area-chart"
  | "bar-chart"
  | "pie-chart"
  | "stacked-bar"
  | "composed-chart"
  | "banded-area"

export interface AdvancedAnalyticsFamily {
  id: string
  label: string
  kind: AdvancedAnalyticsKind
  status: AdvancedAnalyticsStatus
  purpose: string
  allowedWidgetTypes: AdvancedWidgetType[]
  useCases: string[]
  requiredSignals: string[]
  minMonths?: number
  minTransactions?: number
  minCategories?: number
  minVendors?: number
  notes?: string
}

export interface AdvancedAnalyticsVariant {
  id: string
  label: string
  kind: AdvancedAnalyticsKind
  status: AdvancedAnalyticsStatus
  family: string
  purpose: string
  notes?: string
}

export interface AdvancedAnalyticsPattern {
  id: string
  label: string
  kind: AdvancedAnalyticsKind
  status: AdvancedAnalyticsStatus
  purpose: string
  notes?: string
}

export const ADVANCED_ANALYTICS_FAMILIES: AdvancedAnalyticsFamily[] = [
  {
    id: "time_series_simple",
    label: "Time Series",
    kind: "core_family",
    status: "enabled",
    purpose: "Show changes over time across income, expenses, and net position.",
    allowedWidgetTypes: ["line-chart", "area-chart"],
    useCases: [
      "monthly income vs expenses",
      "net-position trend",
      "expense drift over time",
      "income stability vs volatility",
    ],
    requiredSignals: [
      "document_date",
      "period_start",
      "period_end",
      "gross_income",
      "total_amount",
    ],
    minMonths: 3,
    minTransactions: 5,
    notes: "Current renderer fully supports this family.",
  },
  {
    id: "composition_simple",
    label: "Composition",
    kind: "core_family",
    status: "enabled",
    purpose: "Show how a whole is distributed across categories, vendors, types, or income sources.",
    allowedWidgetTypes: ["pie-chart", "bar-chart"],
    useCases: [
      "expense category share",
      "vendor concentration",
      "income source mix",
      "document type distribution",
      "payment method distribution",
    ],
    requiredSignals: [
      "expense_category",
      "vendor_normalized",
      "document_type",
      "income_source",
      "payment_method",
    ],
    minTransactions: 3,
    minCategories: 2,
    notes: "Current renderer supports pie and bar outputs for this family.",
  },
  {
    id: "comparison_multi_metric",
    label: "Comparison",
    kind: "core_family",
    status: "enabled",
    purpose: "Compare two or more meaningful measures on the same grouping key.",
    allowedWidgetTypes: ["bar-chart", "line-chart", "area-chart"],
    useCases: [
      "gross vs net income",
      "income vs expenses vs tax amount",
      "vendor spend vs document count",
      "deductible vs non-deductible amount",
    ],
    requiredSignals: [
      "gross_income",
      "net_income",
      "tax_amount",
      "total_amount",
      "document_date",
    ],
    minMonths: 3,
    minTransactions: 5,
    notes: "Uses existing chart primitives now; richer composed visuals can map here later.",
  },
  {
    id: "time_series_composed",
    label: "Composed Time Series",
    kind: "core_family",
    status: "enabled",
    purpose: "Combine line, bar, and area signals in one historical visual.",
    allowedWidgetTypes: ["composed-chart"],
    useCases: [
      "income line + expense bars + net area",
      "tax amount overlaid on net trend",
      "document volume vs value trend",
    ],
    requiredSignals: [
      "document_date",
      "period_start",
      "period_end",
      "gross_income",
      "total_amount",
      "tax_amount",
    ],
    minMonths: 4,
    minTransactions: 8,
    notes: "Uses composed-chart renderer: income line + expense bars + net area overlay.",
  },
  {
    id: "time_series_banded",
    label: "Banded Time Series",
    kind: "core_family",
    status: "enabled",
    purpose: "Show expected range vs actual values to highlight anomalies and variance.",
    allowedWidgetTypes: ["banded-area"],
    useCases: [
      "monthly spend normal range vs actual",
      "spending volatility bands",
      "expense anomaly windows",
    ],
    requiredSignals: [
      "document_date",
      "period_start",
      "period_end",
      "total_amount",
    ],
    minMonths: 6,
    minTransactions: 12,
    notes: "Spending-first default: monthly spend vs 3-month trailing mean ± 1σ band.",
  },
  {
    id: "composition_stacked",
    label: "Stacked Composition",
    kind: "core_family",
    status: "enabled",
    purpose: "Show how a composition changes over time across grouped entities.",
    allowedWidgetTypes: ["stacked-bar"],
    useCases: [
      "merchant domain share by month",
      "expense category share by month",
      "income source mix by month",
    ],
    requiredSignals: [
      "document_date",
      "period_start",
      "period_end",
      "merchant_domain",
      "expense_category",
    ],
    minMonths: 3,
    minTransactions: 8,
    notes: "Spending-first default: stack by merchant_domain when populated; fall back to expense_category otherwise.",
  },
  {
    id: "timeline_events",
    label: "Timeline",
    kind: "core_family",
    status: "planned",
    purpose: "Show dated milestones, obligations, and event sequences.",
    allowedWidgetTypes: [],
    useCases: [
      "contract obligations timeline",
      "document activity timeline",
      "missing period / filing readiness timeline",
      "payslip cadence or payroll sequence",
    ],
    requiredSignals: [
      "document_date",
      "period_start",
      "period_end",
      "counterparty_name",
      "line_items",
    ],
    minMonths: 1,
    minTransactions: 3,
    notes: "Requires a future dedicated timeline renderer.",
  },
]

export const ADVANCED_ANALYTICS_VARIANTS: AdvancedAnalyticsVariant[] = [
  {
    id: "pie_active_shape",
    label: "Active Shape Pie",
    kind: "visual_variant",
    status: "planned",
    family: "composition_simple",
    purpose: "Emphasize a dominant segment and improve drill-in clarity.",
  },
  {
    id: "pie_custom_labels",
    label: "Pie With Custom Labels",
    kind: "visual_variant",
    status: "planned",
    family: "composition_simple",
    purpose: "Improve readability for named segments and percentages.",
  },
  {
    id: "pie_padding_angle",
    label: "Pie With Padding Angle",
    kind: "visual_variant",
    status: "planned",
    family: "composition_simple",
    purpose: "Improve separation between segments on dense pie charts.",
  },
  {
    id: "custom_shape_bar",
    label: "Custom Shape Bar",
    kind: "visual_variant",
    status: "planned",
    family: "comparison_multi_metric",
    purpose: "Raise visual quality and emphasis without changing analytic meaning.",
  },
  {
    id: "axis_labeled_composed",
    label: "Axis-Labeled Composed",
    kind: "visual_variant",
    status: "planned",
    family: "time_series_composed",
    purpose: "Clarify multi-metric interpretation with stronger axis storytelling.",
  },
]

export const ADVANCED_ANALYTICS_PATTERNS: AdvancedAnalyticsPattern[] = [
  {
    id: "responsive_composed_container",
    label: "Responsive Composed Container",
    kind: "implementation_pattern",
    status: "planned",
    purpose: "Allow richer multi-layer charts to remain stable across responsive breakpoints.",
  },
]

export const ADVANCED_ANALYTICS_NOVELTY_RULES = [
  "No duplicate analytic question in a single run. Questions include trend, composition, comparison, anomaly, concentration, and timeline.",
  "No duplicate primary grouping key in a single run unless the second chart answers a materially different question.",
  "No duplicate metric pair in a single run. If one chart compares income vs expenses, do not generate another chart with the same metric pair.",
  "Do not output the same chart family twice unless the second chart is clearly different in grouping key and business question.",
  "Treat visual variants as rendering choices, not separate discoveries.",
  "If data is too sparse for a family, skip it rather than forcing a weak chart.",
  "Prefer charts that reveal a new story relative to the standard dashboard, not a renamed duplicate of a default chart.",
]

export const ADVANCED_ANALYTICS_GENERATION_RULES = [
  "Generate up to 3 widgets per run.",
  "Each widget must belong to an enabled core family.",
  "Each widget must use an allowed widget_type from the enabled configuration.",
  "Titles must be data-specific and not generic chart labels.",
  "Descriptions should explain the analytic angle, not restate the chart type.",
  "Insights must cite a specific number, percentage, category, vendor, or period from the data.",
  "If data is too sparse, return fewer widgets instead of filler output.",
  "For composition_stacked: when merchant_domain is well-populated across months, prefer grouping by merchant_domain over expense_category — merchant-domain stories are higher-priority spending intelligence.",
  "For time_series_banded: prefer spending volatility as the banded metric over income volatility. Income-volatility bands are only preferred when the user has visibly variable income (multiple employers or business revenue with spikes).",
]

export function getEnabledAnalyticsFamilies(): AdvancedAnalyticsFamily[] {
  return ADVANCED_ANALYTICS_FAMILIES.filter((family) => family.status === "enabled")
}

export function getEnabledAnalyticsWidgetTypes(): AdvancedWidgetType[] {
  return Array.from(
    new Set(getEnabledAnalyticsFamilies().flatMap((family) => family.allowedWidgetTypes)),
  )
}

export function buildAdvancedAnalyticsSystemPrompt(): string {
  const enabledFamilies = getEnabledAnalyticsFamilies()
  const familyText = enabledFamilies
    .map((family) => {
      const thresholds = [
        family.minMonths ? `minMonths=${family.minMonths}` : null,
        family.minTransactions ? `minTransactions=${family.minTransactions}` : null,
        family.minCategories ? `minCategories=${family.minCategories}` : null,
        family.minVendors ? `minVendors=${family.minVendors}` : null,
      ].filter(Boolean).join(", ")

      return [
        `Family: ${family.label} (${family.id})`,
        `Purpose: ${family.purpose}`,
        `Allowed widget types: ${family.allowedWidgetTypes.join(", ") || "none"}`,
        `Use cases: ${family.useCases.join("; ")}`,
        `Required signals: ${family.requiredSignals.join(", ")}`,
        thresholds ? `Thresholds: ${thresholds}` : null,
        family.notes ? `Notes: ${family.notes}` : null,
      ].filter(Boolean).join("\n")
    })
    .join("\n\n")

  return `You are a financial analytics AI generating advanced dashboard widget configurations for AVIntelligence.

Generate up to 3 widgets. Fewer is allowed when the data is sparse.

Each widget must:
- belong to a different enabled analytics family when possible
- answer a genuinely distinct business question
- use only an allowed widget_type from the enabled families
- surface a more advanced analytic angle than the standard dashboard defaults

Enabled analytics families:
${familyText}

Novelty rules:
${ADVANCED_ANALYTICS_NOVELTY_RULES.map((rule) => `- ${rule}`).join("\n")}

Generation rules:
${ADVANCED_ANALYTICS_GENERATION_RULES.map((rule) => `- ${rule}`).join("\n")}

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "widgets": [
    {
      "widget_type": "<line-chart|area-chart|bar-chart|pie-chart>",
      "chart_family": "<enabled family id>",
      "title": "<specific data-driven title>",
      "description": "<one-line subtitle describing the analytic angle>",
      "insight": "<1 sentence with specific numbers, categories, vendors, percentages, or periods>"
    }
  ]
}`
}
