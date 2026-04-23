export const SUPPORTED_DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "payslip",
  "income_statement",
  "bank_statement",
  "transaction_record",
  "contract",
  "agreement",
  "tax_document",
  "general_document",
] as const

export type DocumentType = typeof SUPPORTED_DOCUMENT_TYPES[number]
export type DocumentVirtualView = "unclassified"
export type DateRangePreset = "last_month" | "this_year" | "prev_year" | "custom"
export type ClassificationSort = "date-desc" | "date-asc" | "name"
export type ViewMode = "list" | "grid"

export interface DateRange {
  preset: DateRangePreset
  from: string
  to: string
}

export interface ReportDef {
  id: string
  label: string
  description: string
  requires: "any_file" | "date_and_amount_2" | "income_amount" | "expense_or_income" | "contract_fields"
  coreEnabled: boolean
}

export interface VirtualFolder {
  id: string
  name: string
  parentId: string | null
  isRenaming?: boolean
}

export interface UploadedFile {
  id: string
  filename: string
  file_type: string
  file_size: number
  document_type: string
  created_at: string
  storage_path: string
  folder_id: string | null
  upload_status?: string | null
  scan_reason?: string | null
}

export interface GridPosition {
  col: number
  row: number
}

const DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
  "expense receipt": "receipt",
  expense: "receipt",
  bill: "receipt",
  "salary slip": "payslip",
  "pay slip": "payslip",
  paycheck: "payslip",
  "employment agreement": "contract",
  "service agreement": "contract",
  nda: "contract",
  "bank record": "bank_statement",
  "account statement": "bank_statement",
  "income record": "income_statement",
  "earnings statement": "income_statement",
  "tax form": "tax_document",
  "tax return": "tax_document",
  transaction: "transaction_record",
}

export const CONFIDENCE_THRESHOLD = 0.7
export const MAX_FILE_SIZE = 60 * 1024 * 1024 // 60 MB — matches bucket file_size_limit
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])
export const ALLOWED_FILE_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "heic", "csv", "xlsx"])

export const CLASSIFICATION_FOLDER_MAP: Record<string, string[]> = {
  Receipts: ["receipt"],
  Invoices: ["invoice"],
  Income: ["payslip", "income_statement"],
  Tax: ["tax_document"],
  Contracts: ["contract", "agreement"],
  Transactions: ["bank_statement", "transaction_record"],
  Other: ["general_document"],
}

export const PRESET_LABELS: Record<string, string> = {
  last_month: "Last month",
  this_year: "This year",
  prev_year: "Prev year",
}

export const REPORTS: ReportDef[] = [
  { id: "expense_summary", label: "Expense Summary", description: "Categorized breakdown of all expenses with totals and trends. Ideal for budgeting reviews and cost management.", requires: "date_and_amount_2", coreEnabled: true },
  { id: "income_summary", label: "Income Summary", description: "Consolidated view of all income sources, employer details, and gross/net figures. Perfect for tax filing and financial planning.", requires: "income_amount", coreEnabled: true },
  { id: "tax_bundle", label: "Tax Bundle Summary", description: "Schedule C-ready summary for business income and deductible expenses.", requires: "expense_or_income", coreEnabled: true },
  { id: "profit_loss", label: "Profit & Loss Summary", description: "Income vs. expenses comparison showing net position and savings rate. Essential for freelancers, consultants, and business owners.", requires: "expense_or_income", coreEnabled: true },
  { id: "contract_summary", label: "Contract Summary", description: "Key parties, dates, obligations, and terms extracted from all contracts. Useful for legal reviews, renewals, and compliance tracking.", requires: "contract_fields", coreEnabled: true },
  { id: "key_terms", label: "Key Terms Summary", description: "Critical clauses and definitions consolidated across all contract documents. Great for quick reference before negotiations or renewals.", requires: "contract_fields", coreEnabled: true },
  { id: "business_expense", label: "Business Expense Summary", description: "Business-specific expense breakdown highlighting deductible items and vendor spending. Designed for business tax filing and reimbursements.", requires: "expense_or_income", coreEnabled: true },
]

export const REPORT_ROUTES: Record<string, string> = {
  expense_summary: "/tools/smart-storage/reports/expense-summary",
  income_summary: "/tools/smart-storage/reports/income-summary",
  tax_bundle: "/tools/smart-storage/reports/tax-bundle",
  profit_loss: "/tools/smart-storage/reports/profit-loss",
  contract_summary: "/tools/smart-storage/reports/contract-summary",
  key_terms: "/tools/smart-storage/reports/key-terms",
  business_expense: "/tools/smart-storage/reports/business-expense",
}

export function normalizeDocumentType(raw: string, confidence: number): DocumentType {
  if (confidence < CONFIDENCE_THRESHOLD) return "general_document"
  const lower = raw.toLowerCase().trim()
  if (SUPPORTED_DOCUMENT_TYPES.includes(lower as DocumentType)) return lower as DocumentType
  if (DOCUMENT_TYPE_ALIASES[lower]) return DOCUMENT_TYPE_ALIASES[lower]
  for (const [alias, type] of Object.entries(DOCUMENT_TYPE_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return type
  }
  return "general_document"
}

export function isUnclassifiedDocument(file: Pick<UploadedFile, "document_type">): boolean {
  return !file.document_type || file.document_type === "unknown"
}

export function getPresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)
  switch (preset) {
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: fmt(first), to: fmt(last) }
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case "prev_year":
      return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` }
    default:
      return { from: "", to: today }
  }
}

export function fileExtension(file: File): string {
  return (file.name.split(".").pop() ?? "").toLowerCase()
}

export function isAllowedUploadFile(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type) || ALLOWED_FILE_EXTENSIONS.has(fileExtension(file))
}

export function sortSmartStorageFiles(files: UploadedFile[], sort: ClassificationSort): UploadedFile[] {
  if (sort === "date-desc") return [...files].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  if (sort === "date-asc") return [...files].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  return [...files].sort((a, b) => a.filename.localeCompare(b.filename))
}

export function getDisplayedSmartStorageFiles({
  files,
  currentFolderId,
  documentVirtualView,
  classificationView,
  classificationSort,
}: {
  files: UploadedFile[]
  currentFolderId: string
  documentVirtualView: DocumentVirtualView | null
  classificationView: string | null
  classificationSort: ClassificationSort
}): UploadedFile[] {
  if (documentVirtualView === "unclassified") {
    return sortSmartStorageFiles(files.filter(isUnclassifiedDocument), classificationSort)
  }

  if (classificationView) {
    const matched = classificationView === "Manual Entries"
      ? files.filter(file => file.file_type === "manual")
      : (() => {
          const types = CLASSIFICATION_FOLDER_MAP[classificationView] ?? []
          return files.filter(file => types.some(type => file.document_type?.includes(type) || type === file.document_type))
        })()
    return sortSmartStorageFiles(matched, classificationSort)
  }

  return files.filter(file =>
    (file.folder_id ?? null) === (currentFolderId === "root" ? null : currentFolderId)
  )
}

export function getOrderedDisplayedFiles({
  displayedFiles,
  viewMode,
  classificationView,
  documentVirtualView,
  itemPositions,
}: {
  displayedFiles: UploadedFile[]
  viewMode: ViewMode
  classificationView: string | null
  documentVirtualView: DocumentVirtualView | null
  itemPositions: Record<string, GridPosition>
}): UploadedFile[] {
  if (viewMode !== "grid" || classificationView || documentVirtualView) return displayedFiles
  return [...displayedFiles].sort((a, b) => {
    const posA = itemPositions[a.id] ?? { row: Number.MAX_SAFE_INTEGER, col: Number.MAX_SAFE_INTEGER }
    const posB = itemPositions[b.id] ?? { row: Number.MAX_SAFE_INTEGER, col: Number.MAX_SAFE_INTEGER }
    if (posA.row !== posB.row) return posA.row - posB.row
    return posA.col - posB.col
  })
}

export function findFreeGridSlot(targetCol: number, targetRow: number, occupied: Set<string>): GridPosition {
  if (!occupied.has(`${targetCol},${targetRow}`)) return { col: targetCol, row: targetRow }
  for (let dist = 1; dist < 30; dist++) {
    for (let dc = -dist; dc <= dist; dc++) {
      for (let dr = -dist; dr <= dist; dr++) {
        if (Math.abs(dc) + Math.abs(dr) === dist) {
          const col = Math.max(0, targetCol + dc)
          const row = Math.max(0, targetRow + dr)
          if (!occupied.has(`${col},${row}`)) return { col, row }
        }
      }
    }
  }
  return { col: targetCol, row: targetRow }
}
