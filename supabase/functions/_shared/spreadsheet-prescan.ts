const MAX_CSV_ROWS = 100_000
const MAX_SPREADSHEET_COLUMNS = 256
const MAX_CELL_CHARACTERS = 32_768
const MAX_XLSX_SHEETS = 32
const MAX_XLSX_CELLS = 2_000_000
const MAX_ZIP_ENTRIES = 2_048
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
const MAX_DECOMPRESSION_RATIO = 100
const MAX_PREVIEW_ROWS = 8
const MAX_PREVIEW_COLUMNS = 24
const MAX_PREVIEW_CELL_CHARACTERS = 160
const MAX_PREVIEW_CHARACTERS = 12_000

type InspectionFailure = { ok: false; code: string; reason: string }
type PreviewSuccess = {
  ok: true
  preview: string
  rowCount: number
  columnCount: number
  sheetCount: number
}

export type SpreadsheetPreviewResult = InspectionFailure | PreviewSuccess

const FORMULA_CELL = /^[=@+]/
const COMMAND_CELL = /^-(?!\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$)/

function unsafeSpreadsheetCell(value: string): boolean {
  const normalized = value.trimStart()
  return FORMULA_CELL.test(normalized) || COMMAND_CELL.test(normalized)
}

function safePreviewCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Date) return value.toISOString()
  const text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  return text.length > MAX_PREVIEW_CELL_CHARACTERS
    ? `${text.slice(0, MAX_PREVIEW_CELL_CHARACTERS)}…`
    : text
}

function boundedPreview(value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized.length > MAX_PREVIEW_CHARACTERS
    ? `${serialized.slice(0, MAX_PREVIEW_CHARACTERS)}…`
    : serialized
}

function logicalCsvRows(text: string, limit: number): string[] {
  const rows: string[] = []
  let quoted = false
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && (character === "\n" || character === "\r")) {
      const row = text.slice(start, index)
      if (row.trim()) rows.push(row)
      if (rows.length >= limit) return rows
      if (character === "\r" && text[index + 1] === "\n") index += 1
      start = index + 1
    }
  }
  const finalRow = text.slice(start)
  if (finalRow.trim()) rows.push(finalRow)
  return rows
}

function detectDelimiter(text: string): string {
  const rows = logicalCsvRows(text, 10)
  const candidates = [",", "\t", ";", "|"]
  let best = ","
  let bestScore = -1
  for (const candidate of candidates) {
    const counts = rows.map((row) => {
      let count = 0
      let quoted = false
      for (let index = 0; index < row.length; index += 1) {
        if (row[index] === '"') {
          if (quoted && row[index + 1] === '"') index += 1
          else quoted = !quoted
        } else if (!quoted && row[index] === candidate) count += 1
      }
      return count
    })
    const frequencies = new Map<number, number>()
    for (const count of counts.filter((value) => value > 0)) frequencies.set(count, (frequencies.get(count) ?? 0) + 1)
    const consistency = Math.max(0, ...frequencies.values())
    const score = consistency * 100 + counts.reduce((sum, count) => sum + count, 0)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export function inspectCsv(bytes: Uint8Array): SpreadsheetPreviewResult {
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, code: "csv_invalid_encoding", reason: "CSV must use valid UTF-8 text." }
  }
  if (!text.trim()) return { ok: false, code: "csv_empty", reason: "CSV contains no data." }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return { ok: false, code: "csv_control_characters", reason: "CSV contains unsupported control characters." }
  }

  const delimiter = detectDelimiter(text)
  const leadingPreviewRows: Array<Array<string | number | boolean | null>> = []
  const trailingPreviewRows: Array<Array<string | number | boolean | null>> = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let closedQuote = false
  let rowCount = 0
  let columnCount = 0

  const finishCell = (): InspectionFailure | null => {
    if (cell.length > MAX_CELL_CHARACTERS) {
      return { ok: false, code: "csv_cell_too_large", reason: "CSV contains a cell that exceeds the supported size." }
    }
    if (unsafeSpreadsheetCell(cell)) {
      return { ok: false, code: "csv_formula_cell", reason: "CSV contains spreadsheet formulas or command-like cells." }
    }
    row.push(cell)
    cell = ""
    closedQuote = false
    return null
  }

  const finishRow = (): InspectionFailure | null => {
    if (!row.some((value) => value.trim().length > 0)) {
      row = []
      return null
    }
    rowCount += 1
    if (rowCount > MAX_CSV_ROWS) {
      return { ok: false, code: "csv_too_many_rows", reason: `CSV exceeds the ${MAX_CSV_ROWS.toLocaleString()} row prescan limit.` }
    }
    columnCount = Math.max(columnCount, row.length)
    if (columnCount > MAX_SPREADSHEET_COLUMNS) {
      return { ok: false, code: "csv_too_many_columns", reason: `CSV exceeds the ${MAX_SPREADSHEET_COLUMNS} column prescan limit.` }
    }
    const previewRow = row.slice(0, MAX_PREVIEW_COLUMNS).map(safePreviewCell)
    if (leadingPreviewRows.length < 5) leadingPreviewRows.push(previewRow)
    else {
      trailingPreviewRows.push(previewRow)
      if (trailingPreviewRows.length > MAX_PREVIEW_ROWS - leadingPreviewRows.length) trailingPreviewRows.shift()
    }
    row = []
    return null
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
          closedQuote = true
        }
      } else cell += character
      continue
    }
    if (closedQuote && character !== delimiter && character !== "\n" && character !== "\r" && character !== " " && character !== "\t") {
      return { ok: false, code: "csv_malformed", reason: "CSV contains text after a closing quote." }
    }
    if (closedQuote && (character === " " || character === "\t")) continue
    if (character === '"' && cell.length === 0) {
      quoted = true
    } else if (character === '"') {
      return { ok: false, code: "csv_malformed", reason: "CSV contains a quote inside an unquoted field." }
    } else if (character === delimiter) {
      const failure = finishCell()
      if (failure) return failure
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      const cellFailure = finishCell()
      if (cellFailure) return cellFailure
      const rowFailure = finishRow()
      if (rowFailure) return rowFailure
    } else {
      cell += character
      if (cell.length > MAX_CELL_CHARACTERS) {
        return { ok: false, code: "csv_cell_too_large", reason: "CSV contains a cell that exceeds the supported size." }
      }
    }
  }

  if (quoted) return { ok: false, code: "csv_malformed", reason: "CSV contains an unterminated quoted field." }
  if (cell.length > 0 || row.length > 0) {
    const cellFailure = finishCell()
    if (cellFailure) return cellFailure
    const rowFailure = finishRow()
    if (rowFailure) return rowFailure
  }
  if (rowCount === 0) return { ok: false, code: "csv_empty", reason: "CSV contains no data." }

  return {
    ok: true,
    preview: boundedPreview({ kind: "csv", delimiter, rows: [...leadingPreviewRows, ...trailingPreviewRows] }),
    rowCount,
    columnCount,
    sheetCount: 1,
  }
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = dataView(bytes)
  const earliest = Math.max(0, bytes.length - 65_557)
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return -1
}

export function inspectXlsxArchive(bytes: Uint8Array): { ok: true; entries: string[] } | InspectionFailure {
  if (bytes.length < 22) return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet container is malformed." }
  const view = dataView(bytes)
  const endOffset = findEndOfCentralDirectory(bytes)
  if (endOffset < 0) return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet ZIP directory is missing." }

  const diskNumber = view.getUint16(endOffset + 4, true)
  const centralDisk = view.getUint16(endOffset + 6, true)
  const diskEntryCount = view.getUint16(endOffset + 8, true)
  const entryCount = view.getUint16(endOffset + 10, true)
  const centralSize = view.getUint32(endOffset + 12, true)
  const centralOffset = view.getUint32(endOffset + 16, true)
  const commentLength = view.getUint16(endOffset + 20, true)
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return { ok: false, code: "xlsx_zip64_unsupported", reason: "ZIP64 spreadsheets are not supported." }
  }
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount || entryCount === 0 || entryCount > MAX_ZIP_ENTRIES || centralOffset + centralSize !== endOffset || endOffset + 22 + commentLength !== bytes.length) {
    return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet ZIP directory is invalid or exceeds entry limits." }
  }

  const names: string[] = []
  const seen = new Set<string>()
  let totalCompressed = 0
  let totalUncompressed = 0
  let offset = centralOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet ZIP entry metadata is malformed." }
    }
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const uncompressed = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength
    if (nameLength === 0 || nextOffset > bytes.length || compressed === 0xffffffff || uncompressed === 0xffffffff) {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet ZIP entry is invalid." }
    }
    if ((flags & 0x1) !== 0) return { ok: false, code: "xlsx_encrypted", reason: "Encrypted spreadsheets are not supported." }
    if (method !== 0 && method !== 8) return { ok: false, code: "xlsx_unsupported_compression", reason: "Spreadsheet uses an unsupported compression method." }

    let name: string
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, "/")
    } catch {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet contains an invalid ZIP entry name." }
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet local ZIP entry is missing or malformed." }
    }
    const localFlags = view.getUint16(localOffset + 6, true)
    const localMethod = view.getUint16(localOffset + 8, true)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const localDataOffset = localOffset + 30 + localNameLength + localExtraLength
    if (localDataOffset + compressed > centralOffset || localFlags !== flags || localMethod !== method || (method === 0 && compressed !== uncompressed) || (compressed === 0 && uncompressed > 0)) {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet local ZIP metadata is inconsistent." }
    }
    let localName: string
    try {
      localName = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)).replace(/\\/g, "/")
    } catch {
      return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet contains an invalid local ZIP entry name." }
    }
    if (localName !== name) {
      return { ok: false, code: "xlsx_unsafe_path", reason: "Spreadsheet ZIP entry names are inconsistent." }
    }
    if (name.startsWith("/") || name.split("/").includes("..") || seen.has(name)) {
      return { ok: false, code: "xlsx_unsafe_path", reason: "Spreadsheet contains an unsafe or duplicate archive path." }
    }
    seen.add(name)
    names.push(name)
    totalCompressed += compressed
    totalUncompressed += uncompressed
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES || (compressed > 0 && uncompressed > 1024 * 1024 && uncompressed / compressed > MAX_DECOMPRESSION_RATIO)) {
      return { ok: false, code: "xlsx_archive_bomb", reason: "Spreadsheet expands beyond safe prescan limits." }
    }
    offset = nextOffset
  }
  if (offset !== centralOffset + centralSize) {
    return { ok: false, code: "xlsx_invalid_archive", reason: "Spreadsheet ZIP directory size is inconsistent." }
  }
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_DECOMPRESSION_RATIO) {
    return { ok: false, code: "xlsx_archive_bomb", reason: "Spreadsheet compression ratio exceeds safe prescan limits." }
  }

  const lowerNames = names.map((name) => name.toLowerCase())
  const required = ["[content_types].xml", "_rels/.rels", "xl/workbook.xml"]
  if (!required.every((name) => lowerNames.includes(name))) {
    return { ok: false, code: "xlsx_invalid_container", reason: "Spreadsheet is missing required workbook files." }
  }
  const activeContent = lowerNames.find((name) =>
    name.endsWith("vbaproject.bin") ||
    name.startsWith("xl/activex/") ||
    name.startsWith("xl/embeddings/") ||
    name.startsWith("xl/externallinks/") ||
    name.startsWith("xl/ctrlprops/"),
  )
  if (activeContent) {
    return { ok: false, code: "xlsx_active_content", reason: `Spreadsheet contains unsupported active or embedded content (${activeContent}).` }
  }
  return { ok: true, entries: names }
}

type XlsxLibrary = {
  read(data: Uint8Array, options: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, Record<string, unknown>> }
  utils: {
    decode_range(reference: string): { s: { r: number; c: number }; e: { r: number; c: number } }
    sheet_to_json(sheet: Record<string, unknown>, options: Record<string, unknown>): unknown[][]
  }
}

export async function buildXlsxPreview(bytes: Uint8Array, XLSX: XlsxLibrary): Promise<SpreadsheetPreviewResult> {
  let workbook: ReturnType<XlsxLibrary["read"]>
  try {
    workbook = XLSX.read(bytes, { type: "array", raw: true, cellDates: false, cellFormula: false, bookVBA: false })
  } catch {
    return { ok: false, code: "xlsx_parse_failed", reason: "Spreadsheet workbook could not be parsed safely." }
  }
  if (workbook.SheetNames.length === 0 || workbook.SheetNames.length > MAX_XLSX_SHEETS) {
    return { ok: false, code: "xlsx_sheet_limit", reason: `Spreadsheet must contain between 1 and ${MAX_XLSX_SHEETS} sheets.` }
  }

  const previews: Array<{ name: string; rows: unknown[][] }> = []
  let rowCount = 0
  let columnCount = 0
  let cellCount = 0
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const reference = typeof sheet?.["!ref"] === "string" ? sheet["!ref"] as string : null
    if (!reference) {
      previews.push({ name: sheetName, rows: [] })
      continue
    }
    let range: ReturnType<XlsxLibrary["utils"]["decode_range"]>
    try {
      range = XLSX.utils.decode_range(reference)
    } catch {
      return { ok: false, code: "xlsx_invalid_range", reason: `Spreadsheet sheet ${sheetName} has an invalid cell range.` }
    }
    const sheetRows = range.e.r - range.s.r + 1
    const sheetColumns = range.e.c - range.s.c + 1
    if (sheetRows > MAX_CSV_ROWS) return { ok: false, code: "xlsx_too_many_rows", reason: `Spreadsheet sheet ${sheetName} exceeds the ${MAX_CSV_ROWS.toLocaleString()} row prescan limit.` }
    if (sheetColumns > MAX_SPREADSHEET_COLUMNS) return { ok: false, code: "xlsx_too_many_columns", reason: `Spreadsheet sheet ${sheetName} exceeds the ${MAX_SPREADSHEET_COLUMNS} column prescan limit.` }
    cellCount += sheetRows * sheetColumns
    if (cellCount > MAX_XLSX_CELLS) return { ok: false, code: "xlsx_too_many_cells", reason: "Spreadsheet contains too many cells for safe prescan." }
    rowCount += sheetRows
    columnCount = Math.max(columnCount, sheetColumns)

    const candidateRows = [
      range.s.r,
      range.s.r + 1,
      range.s.r + 2,
      Math.floor((range.s.r + range.e.r) / 2),
      range.e.r - 2,
      range.e.r - 1,
      range.e.r,
    ].filter((rowIndex) => rowIndex >= range.s.r && rowIndex <= range.e.r)
    const representativeRows = [...new Set(candidateRows)].slice(0, MAX_PREVIEW_ROWS)
    const rows = representativeRows.flatMap((rowIndex) =>
      XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: true,
        range: { s: { r: rowIndex, c: range.s.c }, e: { r: rowIndex, c: Math.min(range.e.c, range.s.c + MAX_PREVIEW_COLUMNS - 1) } },
      }).map((row) => row.map(safePreviewCell))
    )
    previews.push({ name: sheetName.slice(0, 120), rows })
  }

  return {
    ok: true,
    preview: boundedPreview({ kind: "xlsx", sheets: previews }),
    rowCount,
    columnCount,
    sheetCount: workbook.SheetNames.length,
  }
}
