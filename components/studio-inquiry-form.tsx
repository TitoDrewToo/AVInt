"use client"

import { FormEvent, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { submitStudioInquiry } from "@/app/studio/actions"
import { Button } from "@/components/ui/button"

type FormStatus = "idle" | "sending" | "success" | "error"

export function StudioInquiryForm() {
  const [status, setStatus] = useState<FormStatus>("idle")
  const [error, setError] = useState("")
  const [honeypot, setHoneypot] = useState("")
  const [startedAt] = useState(() => Date.now())
  const [values, setValues] = useState({ name: "", email: "", company: "", message: "" })

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (status === "error") setStatus("idle")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("sending")
    setError("")
    const result = await submitStudioInquiry({ ...values, honeypot, startedAt })
    if (!result.ok) {
      setError(result.error)
      setStatus("error")
      return
    }
    setStatus("success")
    setValues({ name: "", email: "", company: "", message: "" })
  }

  if (status === "success") {
    return <div className="glass-surface rounded-3xl p-8 text-center md:p-12" role="status"><p className="text-sm font-medium uppercase tracking-wider text-primary">Received</p><h3 className="mt-5 text-2xl font-semibold text-foreground md:text-3xl">Let’s talk about what you want to build.</h3><p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Thanks for reaching out. We’ll review the details and follow up at the email you provided.</p><p className="mt-6 select-text text-sm text-muted-foreground">Or email support@avintph.com</p></div>
  }

  return <form className="glass-surface rounded-3xl p-6 text-left md:p-10" onSubmit={submit} noValidate>
    <input aria-hidden="true" autoComplete="off" className="absolute -left-[9999px] h-px w-px opacity-0" name="website" tabIndex={-1} type="text" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm text-foreground">Your name<input required name="name" autoComplete="name" value={values.name} onChange={(event) => update("name", event.target.value)} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
      <label className="grid gap-2 text-sm text-foreground">Work email<input required name="email" type="email" autoComplete="email" value={values.email} onChange={(event) => update("email", event.target.value)} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
      <label className="grid gap-2 text-sm text-foreground md:col-span-2">Company <span className="text-xs text-muted-foreground">optional</span><input name="company" autoComplete="organization" value={values.company} onChange={(event) => update("company", event.target.value)} className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
    </div>
    <label className="mt-5 grid gap-2 text-sm text-foreground">What would you like to build?<textarea required name="message" value={values.message} onChange={(event) => update("message", event.target.value)} className="min-h-36 resize-y rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
    {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
    <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-relaxed text-muted-foreground">We’ll use these details only to understand the project and follow up.</p><div className="flex flex-col items-start gap-2 sm:items-end"><Button type="submit" size="lg" disabled={status === "sending"} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">{status === "sending" ? "Sending…" : "Start a project"}<ArrowUpRight className="h-4 w-4" /></Button><span className="select-text text-xs text-muted-foreground">Or email support@avintph.com</span></div></div>
  </form>
}
