export function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value)
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  return [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n"
}
