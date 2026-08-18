import type { Metadata } from "next"
import Link from "next/link"
import { ArrowUpRight, Database, LayoutDashboard, Palette, ShieldCheck, Sparkles, Store, Workflow } from "lucide-react"
import { Footer } from "@/components/footer"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"

const studioDescription = "AVIntelligence is a systems and web development studio. We design and build web apps, internal tools, and AI systems end to end — agency-grade work, without the agency overhead."

export const metadata: Metadata = {
  title: "AVIntelligence Studio — Production Software, Built End to End",
  description: studioDescription,
  openGraph: {
    title: "AVIntelligence Studio — Production Software, Built End to End",
    description: studioDescription,
    url: "https://www.avintph.com/studio",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AVIntelligence Studio — Production Software, Built End to End",
    description: studioDescription,
  },
}

const capabilities = [
  {
    icon: <Store className="h-5 w-5" />,
    title: "Bespoke web apps & storefronts",
    description: "Catalogues, storefronts, dashboards, and sites designed and built as one system — like Chroma Fairy, shaped to your brand.",
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: "Custom ingestion → intelligence systems",
    description: "The engine behind Smart Storage, built for any workflow: turn your documents, forms, or data into structured, usable output. We shape it to how your business actually runs.",
  },
  {
    icon: <LayoutDashboard className="h-5 w-5" />,
    title: "Internal tools & operations",
    description: "Role-gated workspaces — records, sales, scheduling, insights — so your team runs on structure instead of spreadsheets.",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Interactive & motion design",
    description: "Custom WebGL and reel-tier interaction when the work calls for something memorable, like Chroma Fairy's living painting.",
  },
  {
    icon: <Workflow className="h-5 w-5" />,
    title: "AI workflow automation",
    description: "Multi-step pipelines that validate, score, route, and act on your incoming data — then write results back and notify the right people. Like the PicklePal partner-onboarding review: Submissions checked by AI, decided, recorded, and emailed automatically.",
  },
]

function ExternalButton({ href, children, variant = "default" }: { href: string; children: React.ReactNode; variant?: "default" | "outline" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Button
        variant={variant}
        size="lg"
        className={`rounded-xl ${variant === "outline" ? "glass-surface-sm hover:text-primary" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
      >
        {children}
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </a>
  )
}

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

export default function StudioPage() {
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
                name: "AVIntelligence Studio",
                description: studioDescription,
                provider: { "@type": "Organization", name: "AVIntelligence", url: "https://www.avintph.com" },
                serviceType: "Web and systems development",
                url: "https://www.avintph.com/studio",
              },
            ],
          }),
        }}
      />
      <Navbar />
      <main className="marketing-scroll-stage relative z-[1] flex flex-1 flex-col">
        <section className="marketing-hero-section marketing-hero-section-spacious relative overflow-hidden px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-5xl">
            <div className="max-w-4xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">The studio</p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                We build production software — fast, and correct.
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl">{studioDescription}</p>
              <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                <div className="flex flex-col items-start gap-1">
                  <ExternalButton href="mailto:support@avintph.com">Start a project</ExternalButton>
                  <span className="select-text text-xs text-muted-foreground">or email support@avintph.com</span>
                </div>
                <InternalButton href="/products/chroma-fairy">See a live build</InternalButton>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">What we build</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Systems that fit the way your work actually moves.</h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <article key={item.title} className="glass-surface hover-bloom h-full rounded-2xl p-6">
                  <div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-xl text-primary">{item.icon}</div>
                  <h3 className="mt-5 font-medium text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-4xl">
            <div className="glass-surface rounded-3xl p-8 md:p-12">
              <div className="flex items-start gap-4">
                <div className="glass-surface-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-primary">How we work</p>
                  <p className="mt-6 text-lg leading-relaxed text-muted-foreground">A human stays on the high-value calls — what to build, is it correct, is it safe — while an AI-orchestrated loop handles the legwork. Everything ships production-grade: real access control, atomic transactions, security review, and self-diagnosing monitoring.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Proof</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Built in the open, shaped by real work.</h2>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              <Link href="/products/chroma-fairy" className="glass-surface hover-bloom group rounded-2xl p-7">
                <div className="flex items-center justify-between gap-4">
                  <Palette className="h-6 w-6 text-primary" />
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                </div>
                <h3 className="mt-8 text-xl font-medium text-foreground">Chroma Fairy</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A living online gallery designed and built end to end.</p>
              </Link>
              <Link href="/products/smart-storage" className="glass-surface hover-bloom group rounded-2xl p-7">
                <div className="flex items-center justify-between gap-4">
                  <Database className="h-6 w-6 text-primary" />
                  <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
                </div>
                <h3 className="mt-8 text-xl font-medium text-foreground">Smart Storage</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">An ingestion and intelligence system built around real document workflows.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-final relative px-6">
          <div className="relative mx-auto max-w-4xl">
            <div className="glass-surface rounded-3xl p-8 text-center md:p-12">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Have something you want built?</p>
              <div className="mt-8 flex justify-center">
                <div className="flex flex-col items-center gap-1">
                  <ExternalButton href="mailto:support@avintph.com">Start a project</ExternalButton>
                  <span className="select-text text-xs text-muted-foreground">or email support@avintph.com</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
