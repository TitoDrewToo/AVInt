"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { InAppBrowserBanner } from "@/components/in-app-browser-banner"
import { supabase } from "@/lib/supabase"

interface AuthGuardModalProps {
  isVisible: boolean
  onSuccess?: () => void
}

export function AuthGuardModal({ isVisible, onSuccess }: AuthGuardModalProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  const reset = (nextMode: "signin" | "signup" | "forgot") => {
    setMode(nextMode); setError(""); setSuccess("")
  }

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">
            {mode === "signin" && "Sign in required"}
            {mode === "signup" && "Create an account"}
            {mode === "forgot" && "Reset your password"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin" && "Please sign in to continue."}
            {mode === "signup" && "Create an account to continue."}
            {mode === "forgot" && "Enter your email to receive a reset link."}
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <InAppBrowserBanner />
          {mode === "signin" && <GoogleSignInButton />}
          {mode === "signin" && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">{success}</p>}

          {/* Sign in */}
          {mode === "signin" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
              <Button
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
                onClick={async () => {
                  setError(""); setLoading(true)
                  const { error } = await supabase.auth.signInWithPassword({ email, password })
                  setLoading(false)
                  if (error) {
                    if (error.message.toLowerCase().includes("invalid login credentials")) {
                      setError("Invalid credentials. If you signed up with Google, use the button above — or click Forgot Password to set a password.")
                    } else {
                      setError(error.message)
                    }
                    return
                  }
                  onSuccess?.()
                }}
              >
                {loading ? "Signing in…" : "Sign in with Email"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button onClick={() => reset("signup")} className="text-muted-foreground transition-colors hover:text-foreground">Create account</button>
                <button onClick={() => reset("forgot")} className="text-muted-foreground transition-colors hover:text-foreground">Forgot password</button>
              </div>
            </div>
          )}

          {/* Sign up */}
          {mode === "signup" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-lg" />
              <Button
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
                onClick={async () => {
                  setError("")
                  if (password !== confirmPassword) { setError("Passwords do not match"); return }
                  if (password.length < 6) { setError("Password must be at least 6 characters"); return }
                  setLoading(true)
                  const { error } = await supabase.auth.signUp({ email, password })
                  setLoading(false)
                  if (error) { setError(error.message); return }
                  setSuccess("Account created. Check your email to confirm.")
                }}
              >
                {loading ? "Creating account…" : "Create Account"}
              </Button>
              <button onClick={() => reset("signin")} className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                Already have an account? Sign in
              </button>
            </div>
          )}

          {/* Forgot password */}
          {mode === "forgot" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Button
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
                onClick={async () => {
                  setError(""); setLoading(true)
                  const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/auth/reset`
                  })
                  setLoading(false)
                  if (error) { setError(error.message); return }
                  setSuccess("Reset email sent. Check your inbox.")
                }}
              >
                {loading ? "Sending…" : "Send Reset Email"}
              </Button>
              <button onClick={() => reset("signin")} className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
