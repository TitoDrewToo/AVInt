import { ArrowUpRight, CalendarDays, LayoutDashboard, Palette, Quote, Store, Workflow } from "lucide-react"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { ChromaFairyShowcase } from "@/components/chroma-fairy-showcase"

export const metadata = {
  title: "Chroma Fairy — A Living Online Gallery | AVIntelligence",
  description: "A living online gallery for painter Samantha Ty, designed and built end to end by AVIntelligence.",
  openGraph: {
    title: "Chroma Fairy — A Living Online Gallery | AVIntelligence",
    description: "A living online gallery for painter Samantha Ty, designed and built end to end by AVIntelligence.",
    url: "https://www.avintph.com/products/chroma-fairy",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chroma Fairy — A Living Online Gallery | AVIntelligence",
    description: "A living online gallery for painter Samantha Ty, designed and built end to end by AVIntelligence.",
  },
}

const designHighlights = [
  { icon: <Palette className="h-5 w-5" />, title: "Living backgrounds", description: "The gallery is designed to feel atmospheric and alive, with artwork shaping the visitor’s sense of place." },
  { icon: <Workflow className="h-5 w-5" />, title: "Cinematic scroll", description: "The page moves like a camera through the work, carrying the visitor from discovery into the studio." },
  { icon: <Quote className="h-5 w-5" />, title: "Tactile detail", description: "Small interactions—from transitions to the contact experience—keep the site feeling made by hand." },
  { icon: <Store className="h-5 w-5" />, title: "Shop + studio foundation", description: "The storefront is supported by a private studio foundation for originals, checkout, commission scheduling, a catalogue, sales, customer records, and insights." },
]

const buildHighlights = [
  { icon: <Store className="h-5 w-5" />, title: "A storefront for originals", description: "A structured catalogue presents available, reserved, and sold works with individual detail pages." },
  { icon: <CalendarDays className="h-5 w-5" />, title: "Commission-led contact", description: "A commission inquiry and scheduling flow gives collectors a direct path into a personal conversation." },
  { icon: <LayoutDashboard className="h-5 w-5" />, title: "A studio behind the gallery", description: "Catalogue, sales, customers, scheduling, and insights are organized in a private operations workspace." },
]

function ExternalButton({ href, children, variant = "default" }: { href: string; children: React.ReactNode; variant?: "default" | "outline" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Button variant={variant} size="lg" className={`cw-button-flow rounded-xl ${variant === "outline" ? "glass-surface-sm hover:text-primary" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
        {children}
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </a>
  )
}

export default function ChromaFairyProductPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: "Chroma Fairy",
          description: "A living online gallery for painter Samantha Ty, designed and built end to end by AVIntelligence.",
          creator: { "@type": "Organization", name: "AVIntelligence", url: "https://www.avintph.com" },
          about: { "@type": "Person", name: "Samantha Ty" },
          url: "https://www.avintph.com/products/chroma-fairy",
          sameAs: "https://www.chromafairy.com/",
        }) }}
      />
      <Navbar />
      <main className="marketing-scroll-stage relative z-[1] flex flex-1 flex-col">
        <section className="marketing-hero-section marketing-hero-section-spacious relative overflow-hidden px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 md:grid-cols-[0.85fr_1.15fr] md:gap-16 lg:gap-24">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Client build · Chroma Fairy</p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                An art site that behaves like a <span className="text-primary">painting.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                A living online gallery for painter Samantha Ty—designed and built end to end by AVIntelligence.
              </p>
              <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                <ExternalButton href="https://www.chromafairy.com/">Visit the live site</ExternalButton>
                <ExternalButton href="https://www.chromafairy.com/#contact" variant="outline">Commission a piece</ExternalButton>
              </div>
            </div>

            <ChromaFairyShowcase />
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-4xl">
            <div className="text-center">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Design highlights</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">The interface gives the artwork room to breathe.</h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Chroma Fairy was shaped as a digital gallery first: quiet when it should be, expressive when the work calls for it.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {designHighlights.map((item) => (
                <article key={item.title} className="glass-surface hover-bloom rounded-2xl p-6">
                  <div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-xl text-primary">{item.icon}</div>
                  <h3 className="mt-5 font-medium text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-5xl">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Build highlights</p>
              <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">The gallery has a real studio behind it.</h2>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">The public experience and the private operations layer were designed as one system, so the work can stay personal without becoming disorganized.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {buildHighlights.map((item) => (
                <article key={item.title} className="glass-surface hover-bloom h-full rounded-2xl p-6">
                  <div className="text-primary">{item.icon}</div>
                  <h3 className="mt-5 font-medium text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
          <div className="relative mx-auto max-w-4xl">
            <div className="glass-surface rounded-3xl p-8 md:p-12">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Built end to end</p>
              <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <h2 className="text-balance text-3xl font-semibold leading-[1.1] text-foreground md:text-5xl">A digital home for the work—and the work around it.</h2>
                  <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Designed and built for Samantha Ty by AVIntelligence, with the freedom to keep sales and commissions personal while the studio grows into its next chapter.</p>
                </div>
                <ExternalButton href="https://www.chromafairy.com/">Visit Chroma Fairy</ExternalButton>
              </div>
            </div>
          </div>
        </section>

        <section className="marketing-scroll-section marketing-scroll-section-final relative px-6">
          <div className="relative mx-auto max-w-4xl">
            <div className="glass-surface rounded-3xl p-8 text-center md:p-12">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">The studio behind the build</p>
              <h2 className="mx-auto mt-6 max-w-3xl text-balance text-3xl font-semibold leading-[1.1] text-foreground md:text-5xl">Chroma Fairy is one example of what we build.</h2>
              <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">AVIntelligence is a systems and web development studio. Chroma Fairy was a client build; the same craft — custom apps, internal tools, and AI systems — is available for yours.</p>
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link href="/studio">
                  <Button variant="outline" size="lg" className="cw-button-flow glass-surface-sm rounded-xl hover:text-primary">
                    Explore the studio
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
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
