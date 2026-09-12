import assert from "node:assert/strict"
import { batchScopeMatches, withoutDuplicateEvidence } from "../lib/ingest-batch-scope"
const batch = { actor_user_id: "buddy", workflow_id: "workflow-a", intake_folder_id: "folder-a" }
const scope = { actorUserId: "buddy", workflowId: "workflow-a", folderId: "folder-a" }
assert.equal(batchScopeMatches("owner", batch, scope), true)
for (const patch of [{ actorUserId: "stranger" }, { workflowId: "workflow-b" }, { folderId: "folder-b" }, { workflowId: null }]) assert.equal(batchScopeMatches("owner", batch, { ...scope, ...patch }), false)
assert.equal(batchScopeMatches("owner", { actor_user_id: null, workflow_id: null, intake_folder_id: null }, { actorUserId: "owner" }), true)
assert.equal(batchScopeMatches("owner", { actor_user_id: null, workflow_id: null, intake_folder_id: null }, scope), false)
const redacted = withoutDuplicateEvidence({ file_id: null, message: "Already in private-payroll.xlsx", existing_file: { id: "private", filename: "private-payroll.xlsx" } })
assert.deepEqual(redacted, { file_id: null, message: "Duplicate file was not added." })
assert.equal(JSON.stringify(redacted).includes("private"), false)
console.log("Ingest batch scope and duplicate redaction tests passed")
