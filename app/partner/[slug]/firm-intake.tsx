"use client"

import { useEffect, useState } from "react"
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { enrollClientByFirmSlug } from "./actions"
import { Button } from "@/components/ui/button"

export function FirmIntake({ slug, firmName }: { slug: string; firmName: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up")
  const [status, setStatus] = useState<"idle" | "working" | "success" | "full" | "admin" | "error">("idle")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return
      setStatus("working")
      const result = await enrollClientByFirmSlug(slug, data.session.access_token)
      if (!active) return
      setStatus(result.ok ? "success" : result.code === "seats_full" ? "full" : result.code === "firm_admin" ? "admin" : "error")
      if (!result.ok && result.code === "seats_full") setMessage("This firm's seats are full — contact your firm.")
      if (!result.ok && result.code === "firm_admin") setMessage("You manage this firm — open your dashboard.")
    })
    return () => { active = false }
  }, [slug])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("working")
    setMessage("")
    const result = mode === "sign-up"
      ? await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/partner/${slug}` },
        })
      : await supabase.auth.signInWithPassword({ email, password })
    if (result.error) {
      setStatus("error")
      setMessage(result.error.message)
      return
    }
    if (!result.data.session) {
      setStatus("error")
      setMessage("Check your email to confirm your account, then return to this link.")
      return
    }
    const enrollment = await enrollClientByFirmSlug(slug, result.data.session.access_token)
    if (!enrollment.ok) {
      setStatus(enrollment.code === "seats_full" ? "full" : enrollment.code === "firm_admin" ? "admin" : "error")
      setMessage(enrollment.code === "seats_full" ? "This firm's seats are full — contact your firm." : "We could not enroll this account. Please try again.")
      if (enrollment.code === "firm_admin") setMessage("You manage this firm — open your dashboard.")
      return
    }
    setStatus("success")
  }

  if (status === "success") {
    return <div className="glass-surface rounded-3xl p-8 text-center md:p-12" role="status"><CheckCircle2 className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-5 text-2xl font-semibold text-foreground">You’re connected to {firmName}.</h2><p className="mt-3 text-muted-foreground">Your Smart Storage seat is ready. Continue to your workspace to upload documents.</p><Button className="mt-7 rounded-xl" onClick={() => { window.location.href = "/tools/smart-storage" }}>Open Smart Storage <ArrowRight className="h-4 w-4" /></Button></div>
  }

  if (status === "admin") {
    return <div className="glass-surface rounded-3xl p-8 text-center md:p-12" role="status"><LockKeyhole className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-5 text-2xl font-semibold text-foreground">You manage this firm.</h2><p className="mt-3 text-muted-foreground">Open your dashboard to manage seats and enrolled clients.</p><Button className="mt-7 rounded-xl" onClick={() => { window.location.href = `/partner/${slug}/dashboard` }}>Open firm dashboard <ArrowRight className="h-4 w-4" /></Button></div>
  }

  return <form onSubmit={submit} className="glass-surface rounded-3xl p-6 md:p-10">
    <div className="flex items-center gap-3 text-primary"><LockKeyhole className="h-5 w-5" /><span className="text-sm font-medium">Secure client intake</span></div>
    <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Sign in or create your Smart Storage account to connect your documents to {firmName}.</p>
    <div className="mt-6 grid gap-4">
      <label className="grid gap-2 text-sm text-foreground">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label>
      <label className="grid gap-2 text-sm text-foreground">Password<input required type="password" minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label>
    </div>
    {message ? <p className="mt-4 text-sm text-destructive" role="alert">{message}</p> : null}
    <Button type="submit" disabled={status === "working"} size="lg" className="mt-6 w-full rounded-xl">{status === "working" ? "Connecting…" : mode === "sign-up" ? "Create account & connect" : "Sign in & connect"}<ArrowRight className="h-4 w-4" /></Button>
    <button type="button" className="mt-5 text-sm text-primary underline-offset-4 hover:underline" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage("") }}>{mode === "sign-in" ? "New to Smart Storage? Create an account" : "Already have an account? Sign in"}</button>
    <a href={`/partner/${slug}/dashboard`} className="mt-4 block text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">Firm administrator? Go to your dashboard</a>
  </form>
}
