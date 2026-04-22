// AbortController-backed fetch wrapper for AI provider calls.
//
// Why: Anthropic / OpenAI / Gemini calls can hang indefinitely during upstream
// incidents and cause an edge function to exhaust its wall-clock budget with
// no log line and no fallback activation. AbortController gives us a hard
// cap; the thrown error message contains "timeout" so
// `_shared/ai-providers.ts#isProviderFailure` recognizes it and the provider
// chain (primary → fallback) continues to the next provider.

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`AI provider fetch timeout after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
