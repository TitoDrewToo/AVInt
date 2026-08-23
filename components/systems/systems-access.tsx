"use client"

import { useEffect, useState, type ReactNode } from "react"
import { supabase } from "@/lib/supabase"

export function useSystemsAdminAccess() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) setAccess("denied")
        return
      }
      const response = await fetch("/api/systems/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)
      if (!cancelled) setAccess(response?.ok ? "allowed" : "denied")
    })()
    return () => { cancelled = true }
  }, [])

  return access
}

export function SystemsInternalGate({ children }: { children: ReactNode }) {
  const access = useSystemsAdminAccess()

  useEffect(() => {
    if (access === "denied") window.location.replace("/")
  }, [access])

  if (access !== "allowed") return <div className="min-h-screen bg-background" />
  return <>{children}</>
}
