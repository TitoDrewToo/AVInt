export type ExtractedDocumentRow = Record<string, unknown>

export class ExtractionShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExtractionShapeError"
  }
}

/** Validate the untrusted JSON shape before any field is persisted. */
export function asExtractedDocumentRows(value: unknown): ExtractedDocumentRow[] {
  if (!Array.isArray(value)) {
    throw new ExtractionShapeError("Extraction output must be a JSON object or array")
  }
  if (value.length === 0) return []

  return value.map((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new ExtractionShapeError(`Extraction row ${index + 1} is not an object`)
    }
    return row as ExtractedDocumentRow
  })
}
