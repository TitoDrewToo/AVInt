import assert from "node:assert/strict"

import { createSingleFlight } from "../lib/single-flight"

async function main() {
  const runOnce = createSingleFlight()
  let requests = 0
  let release!: (value: number) => void
  const operation = () => {
    requests += 1
    return new Promise<number>((resolve) => { release = resolve })
  }

  const first = runOnce("all-workspace-data", operation)
  const strictModeRemount = runOnce("all-workspace-data", operation)
  assert.equal(requests, 1, "concurrent mount effects must share one GET")
  release(180)
  assert.deepEqual(await Promise.all([first, strictModeRemount]), [180, 180])

  assert.equal(await runOnce("all-workspace-data", async () => { requests += 1; return 69 }), 69)
  assert.equal(requests, 2, "refresh after completion must issue a fresh GET")

  console.log("single-flight: strict-mode mounts share one request and refresh remains available")
}

void main()
