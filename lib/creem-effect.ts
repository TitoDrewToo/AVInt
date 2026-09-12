export type CreemProduct = { status: string; plan: string; isGiftCode?: boolean }
type Options = { products: Record<string, CreemProduct>; firmProductId: string; giftCode: () => string }

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}`)
  return value.trim()
}

/** Build only supported effects from an already signature-verified payload. */
export function buildCreemEffect(eventType: string, obj: any, options: Options): Record<string, unknown> {
  if (eventType === "refund.created") {
    return { action: "refund", order_id: required(typeof obj.order === "string" ? obj.order : obj.order?.id, "order id") }
  }
  if (["subscription.canceled", "subscription.expired"].includes(eventType)) {
    return { action: "cancel", subscription_id: required(obj.id, "subscription id") }
  }
  if (!["checkout.completed", "subscription.active", "subscription.paid"].includes(eventType)) return { action: "ignore" }
  const productId = required(obj.product?.id, "product id")
  if (eventType === "checkout.completed" && options.firmProductId && productId === options.firmProductId) {
    const metadata = (key: string) => obj.metadata?.[key] ?? obj.order?.metadata?.[key] ?? obj.checkout?.metadata?.[key]
    const firmId = required(metadata("firm_id"), "firm id")
    const units = Number(metadata("units") ?? obj.order?.quantity ?? obj.quantity)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(firmId) || !Number.isSafeInteger(units) || units < 1 || units > 10000) throw new Error("Invalid firm seat metadata")
    const amount = obj.order?.amount ?? obj.amount
    if (amount != null && (!Number.isSafeInteger(Number(amount)) || Number(amount) < 0)) throw new Error("Invalid amount")
    return { action: "firm", firm_id: firmId, units, amount_cents: amount == null ? null : Number(amount), order_id: required(obj.order?.id, "order id"), product_id: productId }
  }
  const mapping = options.products[productId]
  // Configuration errors must retry; never acknowledge a recognized payment as applied.
  if (!mapping) throw new Error("Unknown payment product")
  const email = required(obj.customer?.email, "customer email").toLowerCase()
  if (!email.includes("@")) throw new Error("Invalid customer email")
  if (mapping.isGiftCode) {
    if (eventType !== "checkout.completed") throw new Error("Unexpected gift subscription event")
    const supplied = obj.license_key?.key ?? obj.license_key
    const code = required(supplied ?? options.giftCode(), "gift code").toUpperCase()
    return { action: "gift", email, code, order_id: required(obj.order?.id, "order id") }
  }
  const checkout = eventType === "checkout.completed"
  const subscriptionId = checkout ? obj.subscription?.id : obj.id
  const periodEnd = checkout ? obj.subscription?.current_period_end_date : obj.current_period_end_date
  if (mapping.plan !== "day_pass" && (!periodEnd || !Number.isFinite(Date.parse(periodEnd)))) throw new Error("Missing or invalid subscription period")
  if (mapping.plan !== "day_pass") required(subscriptionId, "subscription id")
  return {
    action: "subscription", email, product_id: productId, product_name: obj.product?.name ?? "",
    customer_id: required(obj.customer?.id, "customer id"), subscription_id: subscriptionId || null,
    order_id: checkout ? required(obj.order?.id, "order id") : null,
    status: mapping.status, plan: mapping.plan,
    period_end: mapping.plan === "day_pass" ? null : new Date(periodEnd).toISOString(),
    counter_key: mapping.plan === "day_pass" ? `order:${required(obj.order?.id, "order id")}` : `subscription:${subscriptionId}`,
  }
}
