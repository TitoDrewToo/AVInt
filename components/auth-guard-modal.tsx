"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { InAppBrowserBanner } from "@/components/in-app-browser-banner"
import { supabase } from "@/lib/supabase"

interface AuthGuardModalProps {
  isVisible: boolean
  onSuccess?: () => void
  onClose?: () => void
}

export function AuthGuardModal({ isVisible, onSuccess, onClose }: AuthGuardModalProps) {
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

  useEffect(() => {
    if (!isVisible || !onClose) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isVisible, onClose])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 font-sans">
      <div
        className={`absolute inset-0 bg-background/40 backdrop-blur-sm ${onClose ? "cursor-pointer" : ""}`}
        onClick={onClose}
      />
      <div className="glass-surface relative z-10 my-auto w-full max-w-sm overflow-hidden rounded-2xl p-8 shadow-xl">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="cw-button-flow glass-surface-sm absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-primary hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {/* Retro grid backdrop */}
        <div aria-hidden className="retro-grid-bg pointer-events-none absolute inset-0 opacity-40" />
        {/* Centered red radial wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, var(--retro-glow-red) 0%, transparent 65%)",
            filter: "blur(40px)",
            opacity: 0.5,
          }}
        />
        <div className="relative text-center">
          <h2 className="font-sans text-xl font-semibold text-foreground">
            {mode === "signin" && "Sign in required"}
            {mode === "signup" && "Create an account"}
            {mode === "forgot" && "Reset your password"}
          </h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground">
            {mode === "signin" && "Please sign in to continue."}
            {mode === "signup" && "Create an account to continue."}
            {mode === "forgot" && "Enter your email to receive a reset link."}
          </p>
        </div>

        <div className="relative mt-8 space-y-4">
          <InAppBrowserBanner />
          {mode === "signin" && <GoogleSignInButton />}
          {mode === "signin" && (
            <div className="flex items-center gap-3">
              <div className="retro-divider h-px flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="retro-divider h-px flex-1" />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-primary">{success}</p>}

          {mode === "signin" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
              <Button
                className="cw-button-flow w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
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

          {mode === "signup" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg" />
              <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-lg" />
              <Button
                className="cw-button-flow w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
                onClick={async () => {
                  setError("")
                  if (password !== confirmPassword) { setError("Passwords do not match"); return }
                  if (password.length < 6) { setError("Password must be at least 6 characters"); return }
                    setLoading(true)
                    const { error } = await supabase.auth.signUp({ email, password })
                    setLoading(false)
                    if (error) { setError(error.message); return }
                    window.sessionStorage.setItem("avint_signup_welcome_pending", "1")
                    const returnTo = window.location.pathname + window.location.search
                    window.location.href = `/signup/welcome?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`
                  }}
                >
                {loading ? "Creating account…" : "Create Account"}
              </Button>
              <button onClick={() => reset("signin")} className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                Already have an account? Sign in
              </button>
            </div>
          )}

          {mode === "forgot" && (
            <div className="space-y-3">
              <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
              <Button
                className="cw-button-flow w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
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
