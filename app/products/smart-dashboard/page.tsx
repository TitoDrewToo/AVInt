import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StartFreeButton } from "@/components/start-free-button"
import { PomelliClip } from "@/components/ui/pomelli-clip"
import { FadeUp } from "@/components/fade-up"
import { HomeDefaultSphere } from "@/components/home-default-sphere"

export const metadata = {
  title: "Smart Dashboard — AI Powered custom dashboard | AVIntelligence",
  description: "Visualize your income, expenses, and financial trends with an AI-powered dashboard. Customizable widgets, advanced analytics, and AI-generated insights from your documents.",
  openGraph: {
    title: "Smart Dashboard — AI Powered custom dashboard | AVIntelligence",
    description: "Visualize your income, expenses, and financial trends with an AI-powered dashboard. Customizable widgets, advanced analytics, and AI-generated insights from your documents.",
    url: "https://www.avintph.com/products/smart-dashboard",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart Dashboard — AI Powered custom dashboard | AVIntelligence",
    description: "Visualize your income, expenses, and financial trends with an AI-powered dashboard.",
  },
}

const dashboardModules = [
  {
    title: "Spending by Category",
    visualization: (
      <div className="flex h-20 items-end justify-center gap-1.5">
        <div className="sd-anim-bar h-12 w-4 origin-bottom rounded-t bg-primary/60" />
        <div className="sd-anim-bar-25 h-16 w-4 origin-bottom rounded-t bg-primary/80" />
        <div className="sd-anim-bar-5 h-8  w-4 origin-bottom rounded-t bg-primary/40" />
        <div className="sd-anim-bar-75 h-20 w-4 origin-bottom rounded-t bg-primary" />
        <div className="sd-anim-bar-1 h-10 w-4 origin-bottom rounded-t bg-primary/50" />
      </div>
    )
  },
  {
    title: "Monthly Activity Trend",
    visualization: (
      <div className="flex h-20 items-center justify-center">
        <svg viewBox="0 0 100 40" className="h-16 w-full text-primary">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="105"
            points="5,30 20,25 35,28 50,15 65,18 80,10 95,12"
            className="sd-anim-draw"
          />
          {([
            [5,30],[20,25],[35,28],[50,15],[65,18],[80,10],[95,12]
          ] as [number,number][]).map(([cx,cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2" fill="currentColor"
              className="sd-anim-dot"
              style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </svg>
      </div>
    )
  },
  {
    title: "Income vs Expense",
    visualization: (
      <div className="flex h-20 items-center justify-center gap-6">
        <div className="flex flex-col items-center">
          <div className="sd-anim-bar h-14 w-8 origin-bottom rounded bg-primary" />
          <span className="mt-1 text-[10px] text-muted-foreground">In</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="sd-anim-bar-4 h-10 w-8 origin-bottom rounded bg-primary/50" />
          <span className="mt-1 text-[10px] text-muted-foreground">Out</span>
        </div>
      </div>
    )
  },
  {
    title: "Activity Timeline",
    visualization: (
      <div className="flex h-20 items-center justify-center px-4">
        <div className="relative flex w-full items-center">
          <div className="h-0.5 w-full bg-border" />
          {([["10%",0],["30%",1],["55%",2],["75%",3],["90%",4]] as [string,number][]).map(([left,i]) => (
            <div key={i} className="sd-anim-timeline absolute h-3 w-3 rounded-full bg-primary"
              style={{
                left,
                opacity: i % 2 === 0 ? 1 : 0.6,
                animationDelay: `${i * 0.3}s`,
                transformOrigin: "center",
              }}
            />
          ))}
        </div>
      </div>
    )
  },
  {
    title: "Context Summary",
    visualization: (
      <div className="flex h-20 flex-col justify-center gap-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 12 12" className="sd-anim-spark-18 h-3 w-3 flex-shrink-0 text-primary" fill="currentColor">
            <path d="M6 0l1.2 3.8L11 6l-3.8 1.2L6 12l-1.2-4.8L0 6l4.8-1.2z"/>
          </svg>
          <div className="sd-anim-text h-1.5 w-14 origin-left rounded-full bg-primary" />
        </div>
        <div className="sd-anim-text-3 h-1.5 w-full origin-left rounded-full bg-primary/40" />
        <div className="sd-anim-text-6 h-1.5 w-10/12 origin-left rounded-full bg-primary/35" />
        <div className="sd-anim-text-9 h-1.5 w-11/12 origin-left rounded-full bg-primary/30" />
        <div className="sd-anim-text-12 h-1.5 w-7/12 origin-left rounded-full bg-primary/25" />
      </div>
    )
  },
  {
    title: "Advanced Analytics",
    visualization: (
      <div className="relative flex h-20 items-end justify-center gap-1.5 px-2">
        <div className="sd-anim-bar-01 h-8  w-4 origin-bottom rounded-t bg-primary/50" />
        <div className="sd-anim-bar-03 h-12 w-4 origin-bottom rounded-t bg-primary/70" />
        <div className="sd-anim-bar-5 h-6  w-4 origin-bottom rounded-t bg-primary/40" />
        <div className="sd-anim-bar-07 h-16 w-4 origin-bottom rounded-t bg-primary" />
        <div className="sd-anim-bar-09 h-10 w-4 origin-bottom rounded-t bg-primary/60" />
        {/* Insight sparkle above tallest bar */}
        <div className="absolute bottom-[4.2rem] left-1/2 -translate-x-1/2">
          <svg viewBox="0 0 10 10" className="sd-anim-spark-15 h-3.5 w-3.5 text-primary" fill="currentColor">
            <path d="M5 0l1 3.5 3.5 1-3.5 1-1 3.5-1-3.5-3.5-1 3.5-1z"/>
          </svg>
        </div>
      </div>
    )
  },
]

export default function SmartDashboardProductPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" />
      <Navbar />

      <main className="relative z-[1] flex-1">
        {/* Hero */}
        <section className="relative px-6 py-24 md:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-40" />
          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
              <div className="text-left">
                <FadeUp>
                  <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                    Visual clarity from <span className="text-primary">structured</span> data.
                  </h1>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                    Smart Dashboard transforms structured document data into intuitive visual insights.
                  </p>
                </FadeUp>
                <FadeUp delay={0.2}>
                  <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                    <Link href="/pricing">
                      <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                        View Pricing
                      </Button>
                    </Link>
                    <Link href="/products/smart-storage">
                      <Button variant="outline" size="lg" className="rounded-xl glass-surface-sm hover:text-primary">
                        See Smart Storage
                      </Button>
                    </Link>
                  </div>
                </FadeUp>
              </div>
              <FadeUp delay={0.3}>
                <div className="mx-auto w-full max-w-[280px] md:max-w-none">
                  <PomelliClip name="unlock-cloud" rounded="rounded-3xl" glow />
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* What Smart Dashboard shows */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                What Smart Dashboard shows
              </h2>
              <p className="mt-6 text-xl text-foreground md:text-2xl">
                Dashboards provide visibility into financial activity, document patterns, and categorized summaries generated from structured datasets.
              </p>
            </div>
          </div>
        </section>

        {/* Example dashboard modules */}
        <section className="relative px-6 py-24">
          <div className="relative mx-auto max-w-5xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Example dashboard modules
              </h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardModules.map((module) => (
                <div
                  key={module.title}
                  className="glass-surface hover-bloom rounded-2xl p-6"
                >
                  <div className="mb-4 text-sm font-medium text-foreground">{module.title}</div>
                  {module.visualization}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Relationship to Smart Storage */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-3xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                How they work together
              </h2>
              <div className="mt-8 space-y-4">
                <p className="text-lg text-foreground">
                  Smart Storage prepares structured data.
                </p>
                <p className="text-lg text-foreground">
                  Smart Dashboard visualizes structured data.
                </p>
                <p className="mt-6 text-muted-foreground">
                  Together they form a continuous workflow from document ingestion to insight generation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <div className="text-left">
              <FadeUp>
                <h2 className="text-balance text-3xl font-semibold leading-[1.1] text-foreground md:text-4xl lg:text-5xl">
                  Structured data becomes{" "}
                  <span className="text-primary">usable insight.</span>
                </h2>
                <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                  <StartFreeButton tool="smart-dashboard" />
                  <Link href="/pricing">
                    <Button variant="outline" size="lg" className="rounded-xl glass-surface-sm">
                      View Pricing
                    </Button>
                  </Link>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
