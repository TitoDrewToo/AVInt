/**
 * Deliberate server-side release gate, not a hidden-navigation control.
 * Keep closed until delegated batch scoping, atomic membership administration,
 * and organization resource ownership pass their integration proof packs.
 * Do not add an environment override that exposes incomplete authorization.
 */
export function collaborationAvailable(): boolean {
  return false
}

export function collaborationUnavailableResponse(): Response {
  return Response.json({ error: "Collaboration is not yet available", code: "COLLABORATION_NOT_AVAILABLE" }, { status: 503 })
}
