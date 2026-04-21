// Structured log lines for edge functions. Emits single-line JSON so the
// Supabase Functions log explorer indexes fn/stage/event/file_id without
// regex-matching a formatted message. Mirrors the shape of
// lib/api-error.ts#logApiError so the API and edge surfaces produce
// compatible log lines.

type Fields = Record<string, unknown>

export function logEvent(fn: string, event: string, fields: Fields = {}) {
  console.log(JSON.stringify({
    ts:    new Date().toISOString(),
    level: "info",
    fn,
    event,
    ...fields,
  }))
}

export function logError(fn: string, stage: string, err: unknown, fields: Fields = {}) {
  const message = err instanceof Error ? err.message : String(err)
  const stack   = err instanceof Error ? err.stack   : undefined
  console.error(JSON.stringify({
    ts:    new Date().toISOString(),
    level: "error",
    fn,
    stage,
    message,
    stack,
    ...fields,
  }))
}
