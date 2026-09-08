export type PrescanStorageIntent = "approve" | "quarantine" | "hold" | null

export function intendedPrescanTarget(storagePath: string, accountId: string, intent: PrescanStorageIntent) {
  const inboxPrefix = `${accountId}/_inbox/`
  if (!storagePath.startsWith(inboxPrefix)) return null
  if (intent === "approve") return storagePath.replace(inboxPrefix, `${accountId}/`)
  if (intent === "quarantine") return storagePath.replace(inboxPrefix, `${accountId}/_quarantine/`)
  return null
}

export function reconcilePrescanStorageState(input: {
  intent: PrescanStorageIntent
  sourceExists: boolean
  targetExists: boolean
}) {
  if (
    (input.intent === "approve" || input.intent === "quarantine") &&
    !input.sourceExists &&
    input.targetExists
  ) return "restore_then_retry" as const
  return "hold_for_retry" as const
}
