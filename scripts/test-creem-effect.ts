import assert from "node:assert/strict"
import { buildCreemEffect } from "../lib/creem-effect"

const options = { products: { pro: { status: "pro", plan: "monthly" }, day: { status: "day_pass", plan: "day_pass" }, gift: { status: "gift_code", plan: "monthly", isGiftCode: true } }, firmProductId: "firm", giftCode: () => "AVINT-TEST-TEST-TEST" }
const obj = { customer: { id: "cus_1", email: "Owner@Example.com" }, product: { id: "pro" }, order: { id: "ord_1" }, subscription: { id: "sub_1", current_period_end_date: "2026-10-12T00:00:00Z" } }
const checkout = buildCreemEffect("checkout.completed", obj, options)
assert.equal(checkout.email, "owner@example.com")
assert.equal(checkout.counter_key, "subscription:sub_1")
const active = buildCreemEffect("subscription.active", { ...obj, id: "sub_1", current_period_end_date: obj.subscription.current_period_end_date }, options)
assert.equal(active.counter_key, checkout.counter_key)
assert.equal(active.order_id, null) // must not erase the checkout order on active/paid
assert.throws(() => buildCreemEffect("checkout.completed", { ...obj, subscription: {} }, options))
assert.throws(() => buildCreemEffect("checkout.completed", { ...obj, product: { id: "unknown" } }, options))
assert.throws(() => buildCreemEffect("refund.created", {}, options))
assert.throws(() => buildCreemEffect("subscription.canceled", {}, options))
const gift = buildCreemEffect("checkout.completed", { ...obj, product: { id: "gift" } }, options)
assert.equal(gift.code, "AVINT-TEST-TEST-TEST")
assert.equal(gift.order_id, "ord_1")
const day = buildCreemEffect("checkout.completed", { ...obj, product: { id: "day" }, subscription: undefined }, options)
assert.equal(day.counter_key, "order:ord_1")
assert.equal(day.period_end, null) // assigned only inside successful transaction
assert.deepEqual(buildCreemEffect("other.event", {}, options), { action: "ignore" })
assert.throws(() => buildCreemEffect("checkout.completed", { ...obj, product: { id: "firm" }, metadata: { firm_id: "bad", units: 1 } }, options))
console.log("Creem effect validation tests passed")
