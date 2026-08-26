import { Suspense } from "react"
import { PurchaseHandoff } from "@/components/purchase-handoff"

export default function CheckoutPage() {
  return <Suspense fallback={null}><PurchaseHandoff /></Suspense>
}
