import assert from "node:assert/strict"
import { getStudioContactState } from "../components/studio-contact-state.ts"

assert.deepEqual(getStudioContactState(undefined), { bookingAvailable: false, showForm: true })
assert.deepEqual(getStudioContactState(""), { bookingAvailable: false, showForm: true })
assert.deepEqual(getStudioContactState("not-a-url"), { bookingAvailable: false, showForm: true })
assert.deepEqual(getStudioContactState("https://cal.com/avintelligence/intro"), { bookingAvailable: true, showForm: false })

console.log("studio contact fallback tests passed")
