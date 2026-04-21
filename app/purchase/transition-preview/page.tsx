import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { PurchaseFlowPreview } from "@/components/purchase-flow-preview"

export default function PurchaseTransitionPreviewPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <PurchaseFlowPreview />
      </main>
      <Footer />
    </div>
  )
}
