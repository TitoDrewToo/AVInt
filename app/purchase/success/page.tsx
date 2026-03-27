"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { CheckCircle, Copy } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

// Placeholder gift codes for UI preview
const placeholderCodes = ["SSG-AX92-KLM1", "SSG-QT77-BN21"]

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
      <span className="font-mono text-sm font-medium tracking-wider text-foreground">{code}</span>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

export default function PurchaseSuccessPage() {
  // UI placeholder — in production, detect purchase type from query params
  const isGiftCodePurchase = true

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            {/* Success icon */}
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-7 w-7 text-primary" />
              </div>
            </div>

            <h1 className="mt-6 text-2xl font-semibold text-foreground">Purchase successful</h1>
            <p className="mt-2 text-sm text-muted-foreground">Access is now active.</p>

            {/* Gift codes section */}
            {isGiftCodePurchase && (
              <div className="mt-8 text-left">
                <p className="mb-3 text-sm font-medium text-foreground">Your gift codes</p>
                <div className="space-y-2">
                  {placeholderCodes.map((code) => (
                    <CopyableCode key={code} code={code} />
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Each code grants 24 hour access to Smart Storage.
                </p>
              </div>
            )}

            <Link href="/tools/smart-storage">
              <Button size="lg" className="mt-8 w-full rounded-xl">
                Go to Smart Storage
              </Button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}