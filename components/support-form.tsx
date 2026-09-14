"use client"
import { useState } from "react"
import { submitSupportRequest } from "@/app/studio/actions"
import { supabase } from "@/lib/supabase"

export function SupportForm() {
  const [state, setState] = useState<string>("")
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("Sending…")
    const form = new FormData(event.currentTarget)
    const session = (await supabase.auth.getSession()).data.session
    const result = await submitSupportRequest({ email: form.get("email"), subject: form.get("subject"), message: form.get("message"), accessToken: session?.access_token, context: { page: window.location.pathname } })
    setState(result.ok ? `Received. Reference ${result.reference}.` : result.error)
    if (result.ok) event.currentTarget.reset()
  }
  return <form onSubmit={submit} className="mt-8 space-y-4"><input name="email" type="email" required placeholder="Email" className="w-full rounded-xl border border-border bg-background p-3" /><input name="subject" required maxLength={180} placeholder="Subject" className="w-full rounded-xl border border-border bg-background p-3" /><textarea name="message" required maxLength={4000} rows={7} placeholder="What happened?" className="w-full rounded-xl border border-border bg-background p-3" /><button className="rounded-xl bg-primary px-5 py-3 text-primary-foreground" type="submit">Send support request</button>{state && <p role="status" className="text-sm text-muted-foreground">{state}</p>}<p className="text-xs text-muted-foreground">You can also email support@avintph.com if you cannot access this form.</p></form>
}
