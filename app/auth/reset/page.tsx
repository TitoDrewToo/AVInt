"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Eye, EyeOff, Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword]         = useState("")
  const [confirm, setConfirm]           = useState("")
  const [showPw, setShowPw]             = useState(false)
  const [loading, setLoading]           = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [done, setDone]                 = useState(false)
  const [error, setError]               = useState<string | null>(null)

  // Supabase puts the recovery tokens in the URL hash.
  // We need to exchange them for a session before allowing the password update.
  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken  = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const type         = params.get("type")

    if (type === "recovery" && accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) setError("This reset link is invalid or has expired.")
          else setSessionReady(true)
        })
    } else {
      setError("Invalid reset link. Please request a new password reset.")
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => router.replace("/tools/smart-storage"), 2500)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="w-full max-w-md">

          {/* Success state */}
          {done ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Password updated</h1>
              <p className="text-sm text-muted-foreground">Redirecting you to Smart Storage…</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8">
              <h1 className="text-2xl font-semibold text-foreground">Set new password</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a strong password for your AVIntelligence account.
              </p>

              {/* Invalid / expired link */}
              {error && !sessionReady && (
                <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {sessionReady && (
                <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                  {/* New password */}
                  <div className="relative">
                    <Input
                      type={showPw ? "text" : "password"}
                      placeholder="New password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Confirm password */}
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                  />

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button type="submit" className="w-full rounded-xl" size="lg" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
                  </Button>
                </form>
              )}

              {/* Loading session */}
              {!sessionReady && !error && (
                <div className="mt-8 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
