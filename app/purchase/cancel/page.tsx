"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { XCircle } from "lucide-react"
import Link from "next/link"
import { FadeUp, PopIn } from "@/components/fade-up"

export default function PurchaseCancelPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <PopIn className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <XCircle className="h-7 w-7 text-muted-foreground" />
              </div>
            </PopIn>

            <FadeUp delay={0.08}>
              <h1 className="mt-6 text-2xl font-semibold text-foreground">Purchase cancelled</h1>
            </FadeUp>
            <FadeUp delay={0.14}>
              <p className="mt-2 text-sm text-muted-foreground">
                No changes were made to your account.
              </p>
            </FadeUp>

            <FadeUp delay={0.24}>
              <Link href="/pricing">
                <Button
                  size="lg"
                  variant="outline"
                  className="mt-8 w-full rounded-xl"
                >
                  Return to pricing
                </Button>
              </Link>
            </FadeUp>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
