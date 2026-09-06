export function createSingleFlight() {
  const inflight = new Map<string, Promise<unknown>>()
  return function runOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key) as Promise<T> | undefined
    if (existing) return existing
    const request = operation().finally(() => inflight.delete(key))
    inflight.set(key, request)
    return request
  }
}
