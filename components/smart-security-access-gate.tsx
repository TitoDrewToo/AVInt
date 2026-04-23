"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

const SMART_SECURITY_OWNER_EMAIL = "avinnilooban@gmail.com"

export function SmartSecurityAccessGate({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const email = data.session?.user.email?.toLowerCase() ?? ""
      setAllowed(email === SMART_SECURITY_OWNER_EMAIL)
      setLoaded(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email?.toLowerCase() ?? ""
      setAllowed(email === SMART_SECURITY_OWNER_EMAIL)
      setLoaded(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!loaded) {
    return (
      <main className="px-6 pb-24 pt-32">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8">
          <p className="text-sm text-muted-foreground">Checking access...</p>
        </div>
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="px-6 pb-24 pt-32">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Private Preview</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">Smart Security is restricted.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This internal security console is only available to the AVIntelligence owner account while the product is being reinforced.
          </p>
          <Link href="/" className="mt-6 inline-flex">
            <Button variant="outline" className="rounded-xl">Return home</Button>
          </Link>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
