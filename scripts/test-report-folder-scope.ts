import assert from "node:assert/strict"
import { descendantFolderIds } from "@/lib/report-folder-scope"

const folders = [
  { id: "root", parent_id: null },
  { id: "child", parent_id: "root" },
  { id: "grandchild", parent_id: "child" },
  { id: "sibling", parent_id: "root" },
  { id: "other-root", parent_id: null },
]

assert.deepEqual(descendantFolderIds(folders, "root").sort(), ["child", "grandchild", "root", "sibling"])
assert.deepEqual(descendantFolderIds(folders, "child"), ["child", "grandchild"])
assert.deepEqual(descendantFolderIds(folders, "grandchild"), ["grandchild"])
assert.deepEqual(descendantFolderIds(folders, "other-root"), ["other-root"])

console.log("report folder scope tests: 4 passed")
