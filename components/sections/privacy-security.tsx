import Link from "next/link"
import { CheckCircle2, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react"
import { FadeUp } from "@/components/fade-up"

export function PrivacySecuritySection() {
  return (
    <section className="marketing-scroll-section relative px-6">
      <div className="relative mx-auto max-w-6xl">
        <FadeUp>
          <div className="glass-surface rounded-3xl p-7 md:p-10">
            <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-start">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary">Your records stay yours</p>
                <h2 className="mt-4 text-3xl font-semibold text-foreground md:text-4xl">Privacy and security are part of the workflow.</h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">AVIntelligence is built for documents you would not leave in a public folder. We keep access controlled, make processing visible, and give you a direct path to delete your data.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/privacy" className="text-sm font-medium text-primary hover:underline">Read the privacy policy</Link>
                  <Link href="/tools/smart-storage" className="text-sm font-medium text-primary hover:underline">Start free</Link>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
                {[
                  [LockKeyhole, "Controlled access", "Your account gates your documents and reports."],
                  [ShieldCheck, "Security checks", "Uploads pass file and content safety checks before processing."],
                  [Trash2, "Data deletion", "Delete your account and its stored records from the account controls."],
                ].map(([Icon, title, description]) => {
                  const Component = Icon as typeof LockKeyhole
                  return <div key={title as string} className="flex gap-3 rounded-xl border border-border/60 p-4"><Component className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-medium text-foreground">{title as string}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description as string}</p></div></div>
                })}
              </div>
            </div>
            <p className="mt-8 flex items-center gap-2 border-t border-border/50 pt-5 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Read the full commitments in our <Link href="/privacy" className="text-foreground underline underline-offset-4">Privacy</Link> and <Link href="/terms" className="text-foreground underline underline-offset-4">Terms</Link>.</p>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
