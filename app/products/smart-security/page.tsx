import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"
import { Activity, BrainCircuit, FileSearch, ShieldCheck, Siren } from "lucide-react"

export const metadata = {
  title: "Smart Security — Defensive File Scanning | AVIntelligence",
  description: "Smart Security is AVIntelligence's defensive scanning service for uploaded documents, malware checks, structural risk signals, and future active defense.",
  openGraph: {
    title: "Smart Security — Defensive File Scanning | AVIntelligence",
    description: "Standalone defensive scanning for uploaded documents and future active defense.",
    url: "https://www.avintph.com/products/smart-security",
    siteName: "AVIntelligence",
    type: "website",
  },
}

const capabilities = [
  {
    title: "File defense first",
    text: "Uploaded documents are checked by a separate scanner before they enter downstream extraction and reporting.",
    icon: FileSearch,
  },
  {
    title: "Known malware detection",
    text: "ClamAV scanning catches known malware signatures while structural checks look for risky document behaviors.",
    icon: ShieldCheck,
  },
  {
    title: "Attack detection path",
    text: "The same service is designed to grow into abuse detection for upload spikes, repeated failures, and cost-risk patterns.",
    icon: Siren,
  },
  {
    title: "Learning loop",
    text: "Scan decisions are shaped for future Vertex AI reinforcement from reviewed events and customer-specific needs.",
    icon: BrainCircuit,
  },
]

export default function SmartSecurityProductPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <section className="relative overflow-hidden px-6 pb-20 pt-32">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-6xl">
            <FadeUp className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Smart Security</p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] text-foreground md:text-6xl">
                Defensive security engineer for document systems.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground">
                Smart Security is the defense layer we built for AVIntelligence: a standalone service that scans files, detects risky structure, and prepares signals for active defense.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/tools/smart-security">
                  <Button size="lg" className="rounded-xl">Open Console</Button>
                </Link>
                <Link href="/products/smart-storage">
                  <Button variant="outline" size="lg" className="rounded-xl glass-surface-sm">
                    See Smart Storage
                  </Button>
                </Link>
              </div>
            </FadeUp>
          </div>
        </section>

        <section className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <StaggerContainer className="grid gap-4 md:grid-cols-2">
              {capabilities.map(({ title, text, icon: Icon }) => (
                <StaggerItem key={title} className="h-full">
                  <div className="glass-surface hover-bloom h-full rounded-2xl p-6">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-5 text-lg font-semibold text-foreground">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30 px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <FadeUp>
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Roadmap</p>
              <h2 className="mt-4 text-3xl font-semibold text-foreground md:text-4xl">
                Built for defense now, learning next.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                AVIntelligence is the first client, but the service is intentionally separate so it can mature into a defensive API for other SaaS products.
              </p>
            </FadeUp>
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Activity className="h-4 w-4 text-primary" />
                Planned reinforcement path
              </div>
              <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
                <p>1. Store scan events and decisions from real uploads.</p>
                <p>2. Add reviewed labels for false positives, malware, suspicious structure, and customer-specific policy.</p>
                <p>3. Use Vertex AI to support rule recommendations and customer-need understanding.</p>
                <p>4. Promote reviewed rules into active defense only after measured confidence.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
