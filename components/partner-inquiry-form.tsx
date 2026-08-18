"use client"

import { FormEvent, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { submitPartnerInquiry } from "@/app/for-accountants/actions"
import { Button } from "@/components/ui/button"

type FormStatus = "idle" | "sending" | "success" | "error"

export function PartnerInquiryForm() {
  const [status, setStatus] = useState<FormStatus>("idle")
  const [error, setError] = useState("")
  const [honeypot, setHoneypot] = useState("")
  const [startedAt] = useState(() => Date.now())
  const [values, setValues] = useState({ name: "", firm: "", email: "", clientCount: "", message: "" })

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (status === "error") setStatus("idle")
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("sending")
    setError("")
    const result = await submitPartnerInquiry({ ...values, honeypot, startedAt })
    if (!result.ok) {
      setError(result.error)
      setStatus("error")
      return
    }
    setStatus("success")
    setValues({ name: "", firm: "", email: "", clientCount: "", message: "" })
  }

  if (status === "success") {
    return (
      <div className="glass-surface rounded-3xl p-8 text-center md:p-12" role="status">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Received</p>
        <h3 className="mt-5 text-2xl font-semibold text-foreground md:text-3xl">Let’s find the right on-ramp for your firm.</h3>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">Thanks for reaching out. We’ll review the details and follow up at the email you provided.</p>
      </div>
    )
  }

  return (
    <form className="glass-surface rounded-3xl p-6 md:p-10" onSubmit={submit} noValidate>
      <input
        aria-hidden="true"
        autoComplete="off"
        className="absolute -left-[9999px] h-px w-px opacity-0"
        name="website"
        tabIndex={-1}
        type="text"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-foreground">
          Your name
          <input className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" name="name" autoComplete="name" required value={values.name} onChange={(event) => update("name", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          Firm name
          <input className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" name="firm" autoComplete="organization" required value={values.firm} onChange={(event) => update("firm", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          Work email
          <input className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" name="email" autoComplete="email" type="email" required value={values.email} onChange={(event) => update("email", event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm text-foreground">
          Approx. # of 1099/self-employed clients <span className="text-xs text-muted-foreground">optional</span>
          <input className="rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" name="clientCount" inputMode="numeric" pattern="[0-9]*" value={values.clientCount} onChange={(event) => update("clientCount", event.target.value)} />
        </label>
      </div>
      <label className="mt-5 grid gap-2 text-sm text-foreground">
        Message
        <textarea className="min-h-36 resize-y rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" name="message" required value={values.message} onChange={(event) => update("message", event.target.value)} />
      </label>
      {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">We’ll use these details only to understand your firm’s workflow and follow up about the partnership.</p>
        <Button type="submit" size="lg" disabled={status === "sending"} className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
          {status === "sending" ? "Sending…" : "Partner with us"}
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  )
}
