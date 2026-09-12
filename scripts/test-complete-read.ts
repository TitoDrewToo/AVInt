import assert from "node:assert/strict"
import { readComplete } from "../lib/complete-read"

async function main() {
  const data = Array.from({ length: 1105 }, (_, id) => ({ id }))
  // Server cap lower than requested page size must not silently truncate.
  const result = await readComplete(async (from, to) => ({ data: data.slice(from, Math.min(to + 1, from + 100)), count: data.length, error: null }))
  assert.deepEqual(result, data)
  assert.deepEqual(await readComplete(async () => ({ data: [], count: 0, error: null })), [])
  await assert.rejects(readComplete(async () => ({ data: [], count: 4, error: null })))
  await assert.rejects(readComplete(async () => ({ data, count: 1105, error: null }), 1000))
  await assert.rejects(readComplete(async () => ({ data: [], count: null, error: null })))
  let calls = 0
  await assert.rejects(readComplete(async () => ({ data: [{ id: calls++ }], count: calls === 1 ? 3 : 4, error: null })))
  console.log("Complete-read tests passed")
}
void main()
