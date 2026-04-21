export type AiProvider = "anthropic" | "gemini" | "openai"

const VALID_PROVIDERS = new Set(["anthropic", "gemini", "openai"])

export function normalizeProvider(value: string | null | undefined): AiProvider | null {
  const normalized = value?.trim().toLowerCase()
  return normalized && VALID_PROVIDERS.has(normalized) ? normalized as AiProvider : null
}

function legacyProvider(legacyEnvNames: string[]): AiProvider | null {
  for (const name of legacyEnvNames) {
    const provider = normalizeProvider(Deno.env.get(name))
    if (provider) return provider
  }
  return null
}

export function providerChain(
  taskName: string,
  defaultPrimary: AiProvider,
  defaultFallback?: AiProvider,
  legacyEnvNames: string[] = [],
): AiProvider[] {
  const primary =
    normalizeProvider(Deno.env.get(`${taskName}_PROVIDER`)) ??
    legacyProvider(legacyEnvNames) ??
    defaultPrimary
  const fallback = normalizeProvider(Deno.env.get(`${taskName}_FALLBACK_PROVIDER`)) ?? defaultFallback ?? null
  return [primary, fallback].filter((provider, index, providers): provider is AiProvider =>
    Boolean(provider) && providers.indexOf(provider) === index
  )
}

export function isProviderFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return true
  const message = error.message.toLowerCase()
  return (
    message.includes("api error") ||
    message.includes("http 429") ||
    message.includes("http 5") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("empty response") ||
    message.includes("failed to parse") ||
    message.includes("no json")
  )
}
