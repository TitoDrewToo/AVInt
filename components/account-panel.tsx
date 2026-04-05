"use client"

import { useState, useEffect, useRef } from "react"
import { X, User, ChevronDown, ChevronLeft, AlertTriangle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"

interface AccountPanelProps {
  isOpen: boolean
  onClose: () => void
  focusGiftCode?: boolean
}

type ExpandedSection = "subscription" | "email" | "password" | null
type PanelView = "menu" | "privacy" | "terms"

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

function PrivacyPolicyContent() {
  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted-foreground">
        AVIntelligence respects your privacy. We design our systems to process documents automatically and securely.
      </p>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Information We Collect</h3>
        <p className="text-muted-foreground">We collect only the information necessary to provide our services:</p>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>Uploaded files and documents</li>
          <li>Extracted structured data</li>
          <li>Account email address</li>
          <li>Usage activity related to reports and dashboards</li>
        </ul>
        <p className="text-muted-foreground">We do not manually review documents. Processing is automated.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">How Data Is Used</h3>
        <p className="text-muted-foreground">Your data is used to:</p>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>Structure document information</li>
          <li>Generate reports</li>
          <li>Power dashboards</li>
          <li>Improve system performance</li>
        </ul>
        <p className="text-muted-foreground">We do not sell personal data. We do not use documents for advertising purposes.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Data Storage</h3>
        <p className="text-muted-foreground">Files and structured data are securely stored using modern cloud infrastructure. We implement access controls to prevent unauthorized access. Only you can access your uploaded documents and generated outputs.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">AI Processing</h3>
        <p className="text-muted-foreground">Documents may be processed by automated systems to extract structured information such as dates, amounts, document types, and vendors. Processing is performed programmatically. No human review is required.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Data Retention</h3>
        <p className="text-muted-foreground">Documents remain stored until you delete files or delete your account. You may request deletion at any time.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Security</h3>
        <p className="text-muted-foreground">We apply industry standard practices for data storage, access control, and encrypted connections. No system can guarantee absolute security, but we prioritize protection of user data.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">User Control</h3>
        <p className="text-muted-foreground">You may:</p>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>Delete documents</li>
          <li>Update account email</li>
          <li>Change password</li>
          <li>Delete your account</li>
        </ul>
        <p className="text-muted-foreground">Account deletion permanently removes stored data.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Contact</h3>
        <p className="text-muted-foreground">support@avintph.com</p>
      </section>
    </div>
  )
}

function TermsOfServiceContent() {
  return (
    <div className="space-y-6 text-sm">
      <p className="text-muted-foreground">By using AVIntelligence, you agree to the following terms.</p>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Use of Service</h3>
        <p className="text-muted-foreground">AVIntelligence provides tools that help structure and analyze documents. You are responsible for how you use generated outputs. We do not provide financial, legal, or tax advice. Reports are provided as reference tools.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Account Responsibility</h3>
        <p className="text-muted-foreground">You are responsible for maintaining the confidentiality of your account credentials. You agree not to share unauthorized access to your account.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Acceptable Use</h3>
        <p className="text-muted-foreground">You agree not to upload:</p>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>Malicious files</li>
          <li>Illegal content</li>
          <li>Content that violates applicable laws</li>
        </ul>
        <p className="text-muted-foreground">We reserve the right to suspend accounts that misuse the platform.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Service Availability</h3>
        <p className="text-muted-foreground">We aim to provide reliable service but do not guarantee uninterrupted availability. Features may change or improve over time.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Payments</h3>
        <p className="text-muted-foreground">Paid features provide access to advanced reports and analytics. Billing is handled securely through third-party providers. Access duration depends on selected plan.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Limitation of Liability</h3>
        <p className="text-muted-foreground">AVIntelligence is provided as-is. We are not liable for decisions made using generated reports or insights. Users are responsible for verifying outputs before external use.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Updates to Terms</h3>
        <p className="text-muted-foreground">We may update these terms as the service evolves. Continued use of the platform indicates acceptance of updated terms.</p>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium text-foreground">Contact</h3>
        <p className="text-muted-foreground">support@avintph.com</p>
      </section>
    </div>
  )
}

function DeleteAccountModal({
  isOpen,
  onClose,
  session,
}: {
  isOpen: boolean
  onClose: () => void
  session: Session | null
}) {
  const [password, setPassword]   = useState("")
  const [confirm, setConfirm]     = useState("")
  const [deleting, setDeleting]   = useState(false)
  const [error, setError]         = useState("")
  const [deleted, setDeleted]     = useState(false)

  const isOAuth = session?.user?.app_metadata?.provider !== "email"

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPassword("")
      setConfirm("")
      setError("")
      setDeleted(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  async function handleDelete() {
    if (!session?.user) return
    setError("")
    setDeleting(true)
    try {
      // For email users — re-authenticate first to verify password
      if (!isOAuth) {
        const { error: authErr } = await supabase.auth.signInWithPassword({
          email: session.user.email!,
          password,
        })
        if (authErr) {
          setError("Incorrect password. Please try again.")
          setDeleting(false)
          return
        }
      } else {
        // OAuth: require typing DELETE
        if (confirm !== "DELETE") {
          setError('Type DELETE to confirm.')
          setDeleting(false)
          return
        }
      }

      const { data: { session: fresh } } = await supabase.auth.getSession()
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${fresh?.access_token}`,
        },
        body: JSON.stringify({ user_id: session.user.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Deletion failed. Please try again.")
        setDeleting(false)
        return
      }
      setDeleted(true)
      await supabase.auth.signOut()
    } catch {
      setError("Something went wrong. Please try again.")
      setDeleting(false)
    }
  }

  if (deleted) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Account deleted</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account and all associated data have been permanently deleted.
          </p>
          <Button className="mt-6 w-full rounded-lg" onClick={onClose}>Close</Button>
        </div>
      </div>
    )
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
            <p className="mt-2 text-sm text-muted-foreground">
              This permanently deletes all your documents, reports, and account data. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {isOAuth ? (
            <div className="space-y-3">
              {/* Floating callout for OAuth users */}
              <div className="relative rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
                <div className="absolute -top-2 left-4 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:bg-amber-900/60 dark:text-amber-400">
                  Google Account
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  You signed in with Google — no password needed. Type{" "}
                  <span className="font-mono font-bold tracking-wider">DELETE</span>{" "}
                  below to confirm permanent deletion.
                </p>
              </div>
              <Input
                type="text"
                placeholder="DELETE"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError("") }}
                className="rounded-lg font-mono"
                autoComplete="off"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Enter your password to confirm.</p>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError("") }}
                className="rounded-lg"
                autoComplete="current-password"
              />
            </div>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="outline" className="flex-1 rounded-lg" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleDelete}
            disabled={deleting || (!isOAuth && !password) || (isOAuth && confirm !== "DELETE")}
          >
            {deleting ? "Deleting…" : "Delete Account"}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface SubRecord {
  status: string | null
  plan: string | null
  current_period_end: string | null
}

function resolveDisplayPlan(sub: SubRecord | null): { label: string; note: string; isActive: boolean } {
  if (!sub || !sub.status) return { label: "Free", note: "No renewal scheduled", isActive: false }

  const now = Date.now()

  // Day pass: check expiry
  if (sub.status === "day_pass") {
    if (sub.current_period_end && new Date(sub.current_period_end).getTime() < now) {
      return { label: "Free", note: "Day pass expired", isActive: false }
    }
    const expiresAt = sub.current_period_end
      ? new Date(sub.current_period_end).toLocaleString("en-PH", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "—"
    return { label: "Day Pass", note: `Expires ${expiresAt}`, isActive: true }
  }

  if (sub.status === "pro") {
    const note = sub.current_period_end
      ? `Renews ${new Date(sub.current_period_end).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}`
      : "Active"
    return { label: "Pro", note, isActive: true }
  }

  if (sub.status === "gift_code") {
    const note = sub.current_period_end
      ? `Access until ${new Date(sub.current_period_end).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}`
      : "Active"
    return { label: "Pro (Gift)", note, isActive: true }
  }

  if (sub.status === "cancelled") return { label: "Free", note: "Subscription cancelled", isActive: false }

  return { label: "Free", note: "No renewal scheduled", isActive: false }
}

export function AccountPanel({ isOpen, onClose, focusGiftCode }: AccountPanelProps) {
  const [session, setSession] = useState<Session | null>(null)
  const isSignedIn = session !== null
  const [subRecord, setSubRecord] = useState<SubRecord | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null)
  const [panelView, setPanelView] = useState<PanelView>("menu")
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load subscription record whenever session changes
  useEffect(() => {
    if (!session?.user?.id) { setSubRecord(null); return }
    supabase
      .from("subscriptions")
      .select("status, plan, current_period_end")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setSubRecord(data ?? null))
  }, [session])

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
      setPanelView("menu")
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

  const getPanelTitle = () => {
    switch (panelView) {
      case "privacy": return "Privacy Policy"
      case "terms": return "Terms of Service"
      default: return "Account"
    }
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
              {panelView !== "menu" && (
                <button
                  onClick={() => setPanelView("menu")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <div>
                <h2 className="text-lg font-semibold text-foreground">{getPanelTitle()}</h2>
                {panelView === "menu" && isSignedIn && (
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
            {panelView === "privacy" && <PrivacyPolicyContent />}
            {panelView === "terms" && <TermsOfServiceContent />}

            {panelView === "menu" && (
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
                          {(() => {
                            const plan = resolveDisplayPlan(subRecord)
                            return (
                              <div className={`rounded-lg p-3 ${plan.isActive ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
                                <p className="text-xs text-muted-foreground">Current plan</p>
                                <p className={`mt-1 text-sm font-medium ${plan.isActive ? "text-primary" : "text-foreground"}`}>
                                  {plan.label}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{plan.note}</p>
                              </div>
                            )
                          })()}

                          <Button variant="outline" size="sm" className="w-full rounded-lg" disabled>
                            Manage subscription
                          </Button>

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
                                      // Refresh subscription display immediately
                                      if (session?.user?.id) {
                                        supabase
                                          .from("subscriptions")
                                          .select("status, plan, current_period_end")
                                          .eq("user_id", session.user.id)
                                          .single()
                                          .then(({ data: sub }) => setSubRecord(sub ?? null))
                                      }
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

                      <button
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                        disabled
                      >
                        Billing
                        <span className="text-xs text-muted-foreground">Coming soon</span>
                      </button>
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
                          <Input type="email" placeholder="New email" className="rounded-lg" />
                          <Input type="password" placeholder="Password confirmation" className="rounded-lg" />
                          <Button size="sm" className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                            Save email
                          </Button>
                          <p className="text-xs text-muted-foreground">Email change requires password confirmation for security.</p>
                        </div>
                      </AccordionItem>

                      <AccordionItem
                        label="Change password"
                        isExpanded={expandedSection === "password"}
                        onToggle={() => toggleSection("password")}
                      >
                        <div className="space-y-3">
                          <Input type="password" placeholder="Current password" className="rounded-lg" />
                          <Input type="password" placeholder="New password" className="rounded-lg" />
                          <Input type="password" placeholder="Confirm new password" className="rounded-lg" />
                          <Button size="sm" className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
                            Update password
                          </Button>
                          <p className="text-xs text-muted-foreground">Use a strong password.</p>
                        </div>
                      </AccordionItem>
                    </div>

                    {/* Legal */}
                    <div className="h-px bg-border" />
                    <div className="space-y-1">
                      <button
                        onClick={() => setPanelView("privacy")}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Privacy
                        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setPanelView("terms")}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        Terms
                        <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
                      </button>
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
            )}
          </div>
        </div>
      </div>

      <DeleteAccountModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} session={session} />
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