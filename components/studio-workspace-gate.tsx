"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Navbar } from "@/components/navbar"
import { supabase } from "@/lib/supabase"
import { StudioWorkspaceShell } from "@/components/studio-workspace-shell"

export function StudioWorkspaceGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<"checking" | "allowed">("checking")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) window.location.replace("/")
        return
      }
      const response = await fetch("/api/systems/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)
      if (!response?.ok) {
        if (!cancelled) window.location.replace("/")
        return
      }
      if (!cancelled) setAccess("allowed")
    })()
    return () => { cancelled = true }
  }, [])

  if (access !== "allowed") {
    return <><Navbar /><div className="min-h-screen bg-background" /></>
  }

  return <StudioWorkspaceShell>{children}</StudioWorkspaceShell>
}
