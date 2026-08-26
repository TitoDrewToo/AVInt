import Link from "next/link"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PurchaseCancelPage() {
  return <main className="flex min-h-screen items-center justify-center px-6"><div className="glass-surface w-full max-w-md rounded-3xl p-10 text-center"><XCircle className="mx-auto h-12 w-12 text-muted-foreground" /><h1 className="mt-6 text-2xl font-semibold text-foreground">Purchase cancelled</h1><p className="mt-3 text-sm leading-relaxed text-muted-foreground">No changes were made to your account.</p><Link href="/pricing"><Button variant="outline" className="cw-button-flow mt-7 w-full rounded-xl">Return to pricing</Button></Link></div></main>
}
