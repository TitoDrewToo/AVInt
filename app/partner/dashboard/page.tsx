"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, BriefcaseBusiness, Loader2 } from "lucide-react"
import { Footer } from "@/components/footer"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

type Firm = { id: string; name: string; slug: string; status: string }

export default function FirmDashboardResolverPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "none" | "ready" | "error">("loading")
  const [firms, setFirms] = useState<Firm[]>([])

  useEffect(() => {
    let active = true
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        if (active) setState("signed-out")
        return
      }
      const response = await fetch("/api/firm/admin-firms", { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" }).catch(() => null)
      const body = await response?.json().catch(() => ({}))
      if (!active) return
      if (!response?.ok) { setState("error"); return }
      const nextFirms = (body.firms ?? []) as Firm[]
      setFirms(nextFirms)
      if (nextFirms.length === 1) {
        window.location.replace(`/partner/${nextFirms[0].slug}/dashboard`)
        return
      }
      setState(nextFirms.length > 0 ? "ready" : "none")
    })()
    return () => { active = false }
  }, [])

  return <div className="relative flex min-h-screen flex-col"><HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" /><Navbar /><main className="relative z-[1] flex flex-1 items-center px-6 py-24"><div className="mx-auto w-full max-w-3xl"><div className="glass-surface rounded-3xl p-8 md:p-12"><BriefcaseBusiness className="h-7 w-7 text-primary" />{state === "loading" ? <div className="mt-6 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking firm access…</div> : state === "signed-out" ? <><h1 className="mt-6 text-3xl font-semibold text-foreground">Sign in to open your firm dashboard.</h1><p className="mt-3 text-muted-foreground">This area is available to linked firm administrators.</p><Link href="/"><Button className="mt-7 rounded-xl">Return to AVIntelligence <ArrowRight className="h-4 w-4" /></Button></Link></> : state === "error" ? <><h1 className="mt-6 text-3xl font-semibold text-foreground">We couldn’t load your firm access.</h1><p className="mt-3 text-muted-foreground">Please try again or contact support@avintph.com.</p></> : state === "none" ? <><h1 className="mt-6 text-3xl font-semibold text-foreground">No firm dashboard found.</h1><p className="mt-3 text-muted-foreground">Your account is not linked to an active firm administrator record.</p></> : <><h1 className="mt-6 text-3xl font-semibold text-foreground">Choose a firm.</h1><p className="mt-3 text-muted-foreground">Your account manages more than one firm.</p><div className="mt-7 grid gap-3">{firms.map((firm) => <Link key={firm.id} href={`/partner/${firm.slug}/dashboard`} className="glass-surface-sm flex items-center justify-between rounded-2xl p-4 text-foreground transition-colors hover:text-primary"><span>{firm.name}</span><ArrowRight className="h-4 w-4" /></Link>)}</div></>}</div></div></main><Footer /></div>
}
