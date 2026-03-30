"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { supabase } from "@/lib/supabase"

interface AuthGuardModalProps {
  isVisible: boolean
  onSuccess?: () => void
}

export function AuthGuardModal({ isVisible, onSuccess }: AuthGuardModalProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to access tools.
          </p>
        </div>
        <div className="mt-8 space-y-4">
          <GoogleSignInButton />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="space-y-3">
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
          </div>
          <Button
            className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={loading}
            onClick={async () => {
              setError(""); setLoading(true)
              const { error } = await supabase.auth.signInWithPassword({ email, password })
              setLoading(false)
              if (error) { setError(error.message); return }
              onSuccess?.()
            }}
          >
            {loading ? "Signing in…" : "Sign in with Email"}
          </Button>
        </div>
      </div>
    </div>
  )
}
