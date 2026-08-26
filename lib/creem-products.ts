export type CreemPlan = "day-pass" | "gift-codes" | "pro-monthly" | "pro-annual"

export const CREEM_PRODUCTS: Record<CreemPlan, { productId: string; paymentUrl: string; label: string }> = {
  "day-pass": { productId: "prod_RBLECFWVb9ObYTbyzHqRN", paymentUrl: "https://www.creem.io/payment/prod_RBLECFWVb9ObYTbyzHqRN", label: "Day Pass" },
  "gift-codes": { productId: "prod_1E1svEziUd9azxQBFJ0OGE", paymentUrl: "https://www.creem.io/payment/prod_1E1svEziUd9azxQBFJ0OGE", label: "Gift Codes" },
  "pro-monthly": { productId: "prod_6L974BwObN2XQwqi9qxnGF", paymentUrl: "https://www.creem.io/payment/prod_6L974BwObN2XQwqi9qxnGF", label: "Pro Monthly" },
  "pro-annual": { productId: "prod_5hA2fqm9pKV27X9XurBwQs", paymentUrl: "https://www.creem.io/payment/prod_5hA2fqm9pKV27X9XurBwQs", label: "Pro Annual" },
}

export function planForProductId(productId: string) {
  return (Object.entries(CREEM_PRODUCTS).find(([, product]) => product.productId === productId)?.[0] ?? null) as CreemPlan | null
}
