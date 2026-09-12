export type IngestBatchScope = { actorUserId: string; workflowId?: string | null; folderId?: string | null }
export function batchScopeMatches(ownerUserId: string, batch: { actor_user_id: string | null; workflow_id: string | null; intake_folder_id: string | null }, scope: IngestBatchScope): boolean {
  return (batch.actor_user_id ?? ownerUserId) === scope.actorUserId &&
    batch.workflow_id === (scope.workflowId ?? null) && batch.intake_folder_id === (scope.folderId ?? null)
}
export function withoutDuplicateEvidence<T extends { existing_file?: unknown; message?: string }>(result: T): Omit<T, "existing_file"> {
  const { existing_file: _privateEvidence, ...safe } = result
  return _privateEvidence ? { ...safe, message: "Duplicate file was not added." } : safe
}
