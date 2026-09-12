export function operationsCostWindow(rawMonths: string | null, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid cost reporting date")
  const months = Math.floor(Math.min(12, Math.max(1, Number(rawMonths ?? 3) || 3)))
  return { months, since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)) }
}
