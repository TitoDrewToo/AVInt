"use client"

import { useState, useEffect, useRef } from "react"
import { X, User, ChevronDown, AlertTriangle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { supabase } from "@/lib/supabase"
import Link from "next/link"
import type { Session } from "@supabase/supabase-js"

interface SubscriptionData {
  status: string
  plan: string | null
  current_period_end: string | null
  lemonsqueezy_subscription_id: string | null
}

interface AccountPanelProps {
  isOpen: boolean
  onClose: () => void
  focusGiftCode?: boolean
}

type ExpandedSection = "subscription" | "email" | "password" | null

function AccordionItem({
  label,
  isExpanded,
  onToggle,
  children,
  variant = "default",
}: {
  label: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  variant?: "default" | "destructive"
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
          variant === "destructive"
            ? "text-destructive hover:bg-destructive/10"
            : "text-foreground hover:bg-muted"
        }`}
      >
        {label}
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            variant === "destructive" ? "" : "text-muted-foreground"
          } ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-3 pb-3 pt-2">{children}</div>
      </div>
    </div>
  )
}


function DeleteAccountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  const handleDelete = async () => {
    setError("")
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError("Not signed in."); setLoading(false); return }
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: session.user.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "Failed to delete account."); setLoading(false); return }
      await supabase.auth.signOut()
      window.location.href = "/"
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">Delete your account?</h3>
            <p className="mt-2 text-sm text-muted-foreground">This action cannot be undone. All your documents, data, and subscription will be permanently deleted.</p>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1 rounded-lg" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button className="flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete} disabled={loading}>
            {loading ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AccountPanel({ isOpen, onClose, focusGiftCode }: AccountPanelProps) {
  const [session, setSession] = useState<Session | null>(null)
  const isSignedIn = session !== null
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null)
  const [giftCode, setGiftCode] = useState("")
  const [giftCodeLoading, setGiftCodeLoading] = useState(false)
  const [giftCodeError, setGiftCodeError] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot">("signin")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authConfirmPassword, setAuthConfirmPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [authSuccess, setAuthSuccess] = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [giftCodeApplied, setGiftCodeApplied] = useState(false)
  const subscriptionRef = useRef<HTMLDivElement>(null)

  // Subscription state
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelDone, setCancelDone] = useState(false)

  // Email change state
  const [newEmail, setNewEmail] = useState("")
  const [emailConfirmPassword, setEmailConfirmPassword] = useState("")
  const [emailChangeLoading, setEmailChangeLoading] = useState(false)
  const [emailChangeMsg, setEmailChangeMsg] = useState<{type: "error"|"success"; text: string} | null>(null)

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false)
  const [passwordChangeMsg, setPasswordChangeMsg] = useState<{type: "error"|"success"; text: string} | null>(null)

  const fetchSubscription = async (email: string) => {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, plan, current_period_end, lemonsqueezy_subscription_id")
      .eq("email", email)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    setSubscription(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user?.email) fetchSubscription(data.session.user.email)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession?.user?.email) fetchSubscription(newSession.user.email)
      else setSubscription(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isOpen && focusGiftCode) {
      setExpandedSection("subscription")
      setTimeout(() => {
        subscriptionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      }, 300)
    }
  }, [isOpen, focusGiftCode])

  useEffect(() => {
    if (!isOpen) {
      setExpandedSection(null)
      setAuthMode("signin")
      setAuthEmail("")
      setAuthPassword("")
      setAuthConfirmPassword("")
      setAuthError("")
      setAuthSuccess("")
    }
  }, [isOpen])

  const toggleSection = (section: ExpandedSection) => {
    setExpandedSection(expandedSection === section ? null : section)
  }


  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full max-w-[420px] transform border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Account</h2>
                {isSignedIn && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Signed in as<br />
                    <span className="text-foreground">{session?.user?.email ?? "email@example.com"}</span>
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
                {/* Authentication Section */}
                {!isSignedIn && (
                  <div className="space-y-5">
                    <GoogleSignInButton />
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">or continue with email</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {/* Error / success messages */}
                    {authError && <p className="text-xs text-destructive">{authError}</p>}
                    {authSuccess && <p className="text-xs text-primary">{authSuccess}</p>}

                    {/* Sign in form */}
                    {authMode === "signin" && (
                      <div className="space-y-3">
                        <Input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="rounded-lg" />
                        <Input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="rounded-lg" />
                        <Button
                          className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={authLoading}
                          onClick={async () => {
                            setAuthError(""); setAuthLoading(true)
                            const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
                            setAuthLoading(false)
                            if (error) setAuthError(error.message)
                          }}
                        >
                          {authLoading ? "Signing in…" : "Sign In"}
                        </Button>
                        <div className="flex items-center justify-between text-sm">
                          <button onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthSuccess("") }} className="text-muted-foreground transition-colors hover:text-foreground">Create account</button>
                          <button onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthSuccess("") }} className="text-muted-foreground transition-colors hover:text-foreground">Forgot password</button>
                        </div>
                      </div>
                    )}

                    {/* Sign up form */}
                    {authMode === "signup" && (
                      <div className="space-y-3">
                        <Input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="rounded-lg" />
                        <Input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="rounded-lg" />
                        <Input type="password" placeholder="Confirm password" value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} className="rounded-lg" />
                        <Button
                          className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={authLoading}
                          onClick={async () => {
                            setAuthError("")
                            if (authPassword !== authConfirmPassword) { setAuthError("Passwords do not match"); return }
                            if (authPassword.length < 6) { setAuthError("Password must be at least 6 characters"); return }
                            setAuthLoading(true)
                            const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
                            setAuthLoading(false)
                            if (error) setAuthError(error.message)
                            else setAuthSuccess("Account created. Check your email to confirm.")
                          }}
                        >
                          {authLoading ? "Creating account…" : "Create Account"}
                        </Button>
                        <button onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthSuccess("") }} className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                          Already have an account? Sign in
                        </button>
                      </div>
                    )}

                    {/* Forgot password form */}
                    {authMode === "forgot" && (
                      <div className="space-y-3">
                        <Input type="email" placeholder="Email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="rounded-lg" />
                        <Button
                          className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                          disabled={authLoading}
                          onClick={async () => {
                            setAuthError(""); setAuthLoading(true)
                            const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
                              redirectTo: `${window.location.origin}/auth/reset`
                            })
                            setAuthLoading(false)
                            if (error) setAuthError(error.message)
                            else setAuthSuccess("Reset email sent. Check your inbox.")
                          }}
                        >
                          {authLoading ? "Sending…" : "Send Reset Email"}
                        </Button>
                        <button onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthSuccess("") }} className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground">
                          Back to sign in
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Account Settings */}
                {isSignedIn && (
                  <>
                    {/* Subscription — includes gift code redemption */}
                    <div ref={subscriptionRef} className="space-y-1">
                      <AccordionItem
                        label="Subscription"
                        isExpanded={expandedSection === "subscription"}
                        onToggle={() => toggleSection("subscription")}
                      >
                        <div className="space-y-4">
                          {/* Current plan */}
                          <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-xs text-muted-foreground">Current plan</p>
                            <p className="mt-1 text-sm font-medium text-foreground capitalize">
                              {!subscription || subscription.status === "free" || subscription.status === "cancelled"
                                ? "Free"
                                : subscription.status === "day_pass" ? "Day Pass"
                                : subscription.status === "gift_code" ? "Gift Code Access"
                                : subscription.status === "scheduled_cancel" ? "Pro (cancels at period end)"
                                : "Pro"}
                            </p>
                            {subscription?.current_period_end && ["pro", "day_pass", "gift_code", "scheduled_cancel"].includes(subscription.status) && (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {subscription.status === "day_pass" ? "Expires" : subscription.status === "scheduled_cancel" ? "Access until" : "Renews"}{" "}
                                {new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            )}
                          </div>

                          {/* Upgrade button for free users */}
                          {(!subscription || ["free", "cancelled", "day_pass", "gift_code"].includes(subscription.status)) && (
                            <Link href="/pricing">
                              <Button size="sm" className="w-full rounded-lg">
                                {(!subscription || subscription.status === "free" || subscription.status === "cancelled") ? "Upgrade to Pro" : "View plans"}
                              </Button>
                            </Link>
                          )}

                          {/* Cancel subscription for pro users */}
                          {subscription?.status === "pro" && subscription.lemonsqueezy_subscription_id?.trim() && !cancelDone && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                              disabled={cancelLoading}
                              onClick={async () => {
                                if (!session?.user?.id) return
                                setCancelLoading(true)
                                const res = await fetch("/api/creem/cancel", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    subscription_id: subscription.lemonsqueezy_subscription_id,
                                    user_id: session.user.id,
                                  }),
                                })
                                setCancelLoading(false)
                                if (res.ok) {
                                  setCancelDone(true)
                                  setSubscription(prev => prev ? { ...prev, status: "scheduled_cancel" } : prev)
                                }
                              }}
                            >
                              {cancelLoading ? "Cancelling…" : "Cancel subscription"}
                            </Button>
                          )}
                          {cancelDone && (
                            <p className="text-xs text-muted-foreground text-center">Cancellation scheduled — access remains until period end.</p>
                          )}

                          {/* Divider */}
                          <div className="h-px bg-border" />

                          {/* Gift code redemption */}
                          <div>
                            <p className="mb-2 text-xs text-muted-foreground">
                              Redeem a gift code to activate access.
                            </p>
                            <div className="flex gap-2">
                              <Input
                                type="text"
                                placeholder="Enter gift code"
                                value={giftCode}
                                onChange={(e) => { setGiftCode(e.target.value); setGiftCodeError("") }}
                                className="flex-1 rounded-lg"
                                disabled={giftCodeApplied}
                              />
                              <Button
                                size="sm"
                                className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                                disabled={!giftCode.trim() || giftCodeLoading || giftCodeApplied}
                                onClick={async () => {
                                  if (!session?.user) return
                                  setGiftCodeLoading(true)
                                  setGiftCodeError("")
                                  try {
                                    const res = await fetch("/api/redeem-gift", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        code:    giftCode.trim(),
                                        user_id: session.user.id,
                                        email:   session.user.email,
                                      }),
                                    })
                                    const data = await res.json()
                                    if (!res.ok) {
                                      setGiftCodeError(data.error ?? "Failed to redeem code")
                                    } else {
                                      setGiftCodeApplied(true)
                                    }
                                  } catch {
                                    setGiftCodeError("Something went wrong. Please try again.")
                                  } finally {
                                    setGiftCodeLoading(false)
                                  }
                                }}
                              >
                                {giftCodeLoading ? "Applying…" : "Apply"}
                              </Button>
                            </div>
                            {giftCodeError && (
                              <p className="mt-2 text-xs text-destructive">{giftCodeError}</p>
                            )}
                            {giftCodeApplied && (
                              <p className="mt-2 text-xs text-primary">
                                Gift code applied — access is now active.
                              </p>
                            )}
                          </div>
                        </div>
                      </AccordionItem>

                      <Link
                        href="/redeem"
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Redeem gift code
                        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </Link>
                    </div>

                    {/* Email & Password */}
                    <div className="h-px bg-border" />
                    <div className="space-y-1">
                      <AccordionItem
                        label="Email"
                        isExpanded={expandedSection === "email"}
                        onToggle={() => toggleSection("email")}
                      >
                        <div className="space-y-3">
                          <Input type="email" placeholder="New email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="rounded-lg" />
                          <Input type="password" placeholder="Current password" value={emailConfirmPassword} onChange={(e) => setEmailConfirmPassword(e.target.value)} className="rounded-lg" />
                          {emailChangeMsg && (
                            <p className={`text-xs ${emailChangeMsg.type === "error" ? "text-destructive" : "text-primary"}`}>{emailChangeMsg.text}</p>
                          )}
                          <Button
                            size="sm"
                            className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={emailChangeLoading || !newEmail}
                            onClick={async () => {
                              setEmailChangeLoading(true); setEmailChangeMsg(null)
                              const { error } = await supabase.auth.updateUser({ email: newEmail })
                              setEmailChangeLoading(false)
                              if (error) setEmailChangeMsg({ type: "error", text: error.message })
                              else setEmailChangeMsg({ type: "success", text: "Confirmation sent to your new email." })
                            }}
                          >
                            {emailChangeLoading ? "Saving…" : "Save email"}
                          </Button>
                          <p className="text-xs text-muted-foreground">A confirmation will be sent to the new address.</p>
                        </div>
                      </AccordionItem>

                      <AccordionItem
                        label="Change password"
                        isExpanded={expandedSection === "password"}
                        onToggle={() => toggleSection("password")}
                      >
                        <div className="space-y-3">
                          <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="rounded-lg" />
                          <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-lg" />
                          <Input type="password" placeholder="Confirm new password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="rounded-lg" />
                          {passwordChangeMsg && (
                            <p className={`text-xs ${passwordChangeMsg.type === "error" ? "text-destructive" : "text-primary"}`}>{passwordChangeMsg.text}</p>
                          )}
                          <Button
                            size="sm"
                            className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                            disabled={passwordChangeLoading || !newPassword}
                            onClick={async () => {
                              if (newPassword !== confirmNewPassword) { setPasswordChangeMsg({ type: "error", text: "Passwords do not match." }); return }
                              if (newPassword.length < 8) { setPasswordChangeMsg({ type: "error", text: "Password must be at least 8 characters." }); return }
                              setPasswordChangeLoading(true); setPasswordChangeMsg(null)
                              const { error } = await supabase.auth.updateUser({ password: newPassword })
                              setPasswordChangeLoading(false)
                              if (error) setPasswordChangeMsg({ type: "error", text: error.message })
                              else { setPasswordChangeMsg({ type: "success", text: "Password updated successfully." }); setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("") }
                            }}
                          >
                            {passwordChangeLoading ? "Updating…" : "Update password"}
                          </Button>
                        </div>
                      </AccordionItem>
                    </div>

                    {/* Legal */}
                    <div className="h-px bg-border" />
                    <div className="space-y-1">
                      <Link
                        href="/privacy"
                        onClick={onClose}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Privacy
                        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </Link>
                      <Link
                        href="/terms"
                        onClick={onClose}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Terms
                        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </Link>
                    </div>

                    {/* Delete Account */}
                    <div className="h-px bg-border" />
                    <div className="space-y-1">
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        Delete account
                        <ChevronDown className="h-4 w-4 -rotate-90" />
                      </button>
                    </div>

                    {/* Sign Out */}
                    <div className="h-px bg-border" />
                    <div className="space-y-1">
                      <button
                        onClick={() => supabase.auth.signOut()}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Sign out
                        <LogOut className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </>
                )}
              </div>
          </div>
        </div>
      </div>

      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} />
    </>
  )
}

export function AccountMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Open account menu"
    >
      <User className="h-4 w-4" />
    </button>
  )
}