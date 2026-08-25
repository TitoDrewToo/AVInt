"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"

export function StartFreeButton({ tool }: { tool: "smart-storage" | "smart-dashboard" }) {
  const [session, setSession] = useState<Session | null>(null)
  const entitlement = useEntitlement(session)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => { if (active) setSession(data.session) }).catch(() => { if (active) setSession(null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (active) setSession(nextSession) })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const label = entitlement.loading ? "Checking…" : entitlement.isActive ? "Launch" : "Start free"

  return (
    <Link href={`/tools/${tool}`} target="_blank" rel="noopener noreferrer">
      <Button size="lg" className="cw-button-flow rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
        {label}
      </Button>
    </Link>
  )
}
