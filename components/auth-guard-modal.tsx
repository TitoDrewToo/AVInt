"use client"

import { useState, useEffect } from "react"
import { Copy, Check as CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { supabase } from "@/lib/supabase"

function getInAppBrowserName(): string | null {
  if (typeof navigator === "undefined") return null
  const ua = navigator.userAgent
  if (/FBAN|FBAV/i.test(ua)) return "Facebook"
  if (/Instagram/i.test(ua)) return "Instagram"
  if (/Twitter/i.test(ua)) return "Twitter"
  if (/LinkedInApp/i.test(ua)) return "LinkedIn"
  if (/Snapchat/i.test(ua)) return "Snapchat"
  if (/TikTok/i.test(ua)) return "TikTok"
  if (/Line\//i.test(ua)) return "Line"
  if (/\bwv\b/i.test(ua) && /Android/i.test(ua)) return "an in-app browser"
  return null
}

function InAppBrowserBanner() {
  const [appName, setAppName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setAppName(getInAppBrowserName())
  }, [])

  if (!appName) return null

  const handleCopy = () => {
    navigator.clipboard.writeText("https://www.avintph.com").then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-amber-400">
        You&apos;re in {appName}&apos;s browser
      </p>
      <p className="mt-1 text-xs text-amber-400/80">
        Google sign-in is blocked here. Open the link in Safari or Chrome to sign in.
      </p>
      <button
        onClick={handleCopy}
        className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
      >
        {copied ? <CheckIcon className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied!" : "Copy avintph.com"}
      </button>
    </div>
  )
}

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
