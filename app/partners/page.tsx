import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, FileArchive, FileSpreadsheet, LockKeyhole, ShieldCheck, Users, Workflow } from "lucide-react"
import { Footer } from "@/components/footer"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { PartnerInquiryForm } from "@/components/partner-inquiry-form"
import { Button } from "@/components/ui/button"

const pageDescription = "Smart Storage for accounting firms: give your team a repeatable way to turn client documents into tax-ready Schedule C exports and organized audit evidence."

export const metadata: Metadata = {
  title: "Smart Storage for Accounting Firms | AVIntelligence",
  description: pageDescription,
  openGraph: {
    title: "Smart Storage for Accounting Firms | AVIntelligence",
    description: pageDescription,
    url: "https://www.avintph.com/partners",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart Storage for Accounting Firms | AVIntelligence",
    description: pageDescription,
  },
}

const firmOutputs = [
  {
    icon: <FileSpreadsheet className="h-5 w-5" />,
    title: "Tax-ready Schedule C CSV",
    description: "Receive each client’s organized expense output in a format your team can move into its existing workflow.",
  },
  {
    icon: <FileArchive className="h-5 w-5" />,
    title: "Organized audit-evidence ZIP",
    description: "Keep the source evidence grouped and accessible alongside the structured results, without another sorting project.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Adoption tracking",
    description: "See which clients have started, what has come in, and where your team can follow up before the deadline pressure arrives.",
  },
]

const securityCommitments = [
  "Commercial, paid APIs are used for processing.",
  "Customer data is not used to train models.",
  "Row-level security keeps organizations isolated.",
  "Data is retained briefly for the workflow, then deleted according to the system’s retention policy.",
  "Smart Storage is an organization tool — not tax advice and not a substitute for Circular 230 judgment.",
]

function InternalButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <Button variant="outline" size="lg" className="glass-surface-sm rounded-xl hover:text-primary">
        {children}
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </Link>
  )
}

export default function ForAccountantsPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                name: "AVIntelligence",
                url: "https://www.avintph.com",
                email: "support@avintph.com",
              },
              {
                "@type": "Service",
                name: "Smart Storage for accounting firms",
                description: pageDescription,
                provider: { "@type": "Organization", name: "AVIntelligence", url: "https://www.avintph.com" },
                serviceType: "Accounting workflow organization and document intelligence",
                audience: { "@type": "Audience", audienceType: "Accounting firms" },
                url: "https://www.avintph.com/partners",
              },
            ],
          }),
        }}
      />
      <Navbar />
      <main className="marketing-scroll-stage relative z-[1] flex flex-1 flex-col">
        <section className="marketing-hero-section marketing-hero-section-spacious relative overflow-hidden px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[1.1fr_0.9fr] md:gap-20">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">For accounting firms</p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">Smart Storage for accounting firms.</h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">Give your team back the hours currently spent sorting receipts, chasing missing documents, and assembling evidence — with a client workflow that turns incoming files into organized output.</p>
              <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                <a href="#partner-inquiry">
                  <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                    Partner with us
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
                <InternalButton href="/products/smart-storage">See Smart Storage</InternalButton>
              </div>
            </div>
            <div className="glass-surface relative overflow-hidden rounded-[2rem] border border-primary/20 p-7 shadow-[0_24px_90px_-40px_var(--retro-glow-red)] md:p-9">
              <div aria-hidden className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">The handoff</p>
                  <Workflow className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-7 space-y-4">
                  {["Client documents", "Validated records", "Schedule C + evidence"].map((label, index) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="glass-surface-sm flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">{index === 0 ? <FileArchive className="h-4 w-4" /> : index === 1 ? <ShieldCheck className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />}</div>
                      <span className="text-sm text-foreground/85">{label}</span>
                      {index < 2 ? <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.8fr_1.2fr] md:items-center md:gap-20">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-primary">The problem</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Receipt-sorting hours are not where your firm should spend its attention.</h2>
            </div>
            <div className="glass-surface rounded-3xl p-7 md:p-10">
              <BriefcaseBusiness className="h-6 w-6 text-primary" />
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">Every client who sends a mixed folder of receipts creates a small operations project: identify the documents, find the missing context, normalize the details, and preserve the evidence. Multiply that by a busy book of 1099 and self-employed clients, and the sorting becomes a recurring labor cost.</p>
              <p className="mt-5 text-lg leading-relaxed text-foreground">Smart Storage gives that work a repeatable path before it reaches your team.</p>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">What your firm gets</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">A cleaner client handoff, with room to keep your margin.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {firmOutputs.map((item) => (
                <article key={item.title} className="glass-surface hover-bloom h-full rounded-2xl p-6">
                  <div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-xl text-primary">{item.icon}</div>
                  <h3 className="mt-5 font-medium text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center text-base text-muted-foreground">Your firm keeps the margin and the client relationship.</p>
          </div>
        </section>

        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-5xl">
            <div className="glass-surface rounded-3xl p-8 md:p-12">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">How it works</p>
              <h2 className="mt-6 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Give every client a structured path into your firm.</h2>
              <div className="mt-12 grid gap-4 md:grid-cols-2">
                <article className="glass-surface-sm rounded-2xl p-6">
                  <div className="flex items-center gap-3 text-primary"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 text-sm">1</span><ArrowRight className="h-4 w-4" /></div>
                  <h3 className="mt-6 font-medium text-foreground">Provision a co-branded intake link</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Share one firm-branded link with your clients so each enrolled account is connected to your firm from its first upload.</p>
                </article>
                <article className="glass-surface-sm rounded-2xl p-6">
                  <div className="flex items-center gap-3 text-primary"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 text-sm">2</span><LockKeyhole className="h-4 w-4" /></div>
                  <h3 className="mt-6 font-medium text-foreground">Add annual client seats</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Buy the capacity your firm needs, bundle it into your intake fee, keep your margin, and lock in a founding-partner introductory rate for your term.</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-5xl">
            <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:items-start md:gap-20">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary">Security &amp; trust</p>
                <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Built for sensitive documents and careful firms.</h2>
              </div>
              <div className="glass-surface rounded-3xl p-7 md:p-10">
                <ul className="space-y-5">
                  {securityCommitments.map((commitment) => (
                    <li key={commitment} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <span>{commitment}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="partner-inquiry" className="marketing-scroll-section marketing-scroll-section-final relative scroll-mt-24 px-6">
          <div className="relative mx-auto max-w-4xl">
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Partner with us</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Tell us how your firm works today.</h2>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">We’ll help you provision the right seat capacity and co-branded intake workflow for your firm.</p>
            </div>
            <PartnerInquiryForm />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
