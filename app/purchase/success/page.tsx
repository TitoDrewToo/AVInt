"use client"

import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PurchaseSuccessPage() {
  return <main className="flex min-h-screen items-center justify-center px-6"><div className="glass-surface w-full max-w-md rounded-3xl p-10 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-primary" /><h1 className="mt-6 text-2xl font-semibold text-foreground">You&apos;re all set</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Your purchase is being connected to your account. Head to Smart Storage to continue.</p><Link href="/tools/smart-storage" target="_blank" rel="noopener noreferrer"><Button className="cw-button-flow mt-7 w-full rounded-xl">Open Smart Storage</Button></Link></div></main>
}
