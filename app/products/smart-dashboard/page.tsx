import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StartFreeButton } from "@/components/start-free-button"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"

const dashboardModules = [
  {
    title: "Spending by Category",
    visualization: (
      <div className="flex h-20 items-end justify-center gap-1.5">
        <div className="h-12 w-4 origin-bottom rounded-t bg-primary/60" style={{ animation: "sd-bar 2s ease-in-out infinite" }} />
        <div className="h-16 w-4 origin-bottom rounded-t bg-primary/80" style={{ animation: "sd-bar 2s .25s ease-in-out infinite" }} />
        <div className="h-8  w-4 origin-bottom rounded-t bg-primary/40" style={{ animation: "sd-bar 2s .5s ease-in-out infinite" }} />
        <div className="h-20 w-4 origin-bottom rounded-t bg-primary"    style={{ animation: "sd-bar 2s .75s ease-in-out infinite" }} />
        <div className="h-10 w-4 origin-bottom rounded-t bg-primary/50" style={{ animation: "sd-bar 2s 1s ease-in-out infinite" }} />
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
            style={{ animation: "sd-draw 2.5s ease-in-out infinite" }}
          />
          {([
            [5,30],[20,25],[35,28],[50,15],[65,18],[80,10],[95,12]
          ] as [number,number][]).map(([cx,cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="2" fill="currentColor"
              style={{ animation: `sd-dot 2.5s ${i * 0.18}s ease-in-out infinite` }} />
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
          <div className="h-14 w-8 origin-bottom rounded bg-primary"
            style={{ animation: "sd-bar 2s ease-in-out infinite" }} />
          <span className="mt-1 text-[10px] text-muted-foreground">In</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="h-10 w-8 origin-bottom rounded bg-primary/50"
            style={{ animation: "sd-bar 2s .4s ease-in-out infinite" }} />
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
            <div key={i} className="absolute h-3 w-3 rounded-full bg-primary"
              style={{
                left,
                opacity: i % 2 === 0 ? 1 : 0.6,
                animation: `sd-timeline 2s ${i * 0.3}s ease-in-out infinite`,
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
          <svg viewBox="0 0 12 12" className="h-3 w-3 flex-shrink-0 text-primary" fill="currentColor"
            style={{ animation: "sd-spark 1.8s ease-in-out infinite" }}>
            <path d="M6 0l1.2 3.8L11 6l-3.8 1.2L6 12l-1.2-4.8L0 6l4.8-1.2z"/>
          </svg>
          <div className="h-1.5 w-14 origin-left rounded-full bg-primary"
            style={{ animation: "sd-text 2.4s ease-in-out infinite" }} />
        </div>
        <div className="h-1.5 w-full origin-left rounded-full bg-primary/40"
          style={{ animation: "sd-text 2.4s .3s ease-in-out infinite" }} />
        <div className="h-1.5 w-10/12 origin-left rounded-full bg-primary/35"
          style={{ animation: "sd-text 2.4s .6s ease-in-out infinite" }} />
        <div className="h-1.5 w-11/12 origin-left rounded-full bg-primary/30"
          style={{ animation: "sd-text 2.4s .9s ease-in-out infinite" }} />
        <div className="h-1.5 w-7/12 origin-left rounded-full bg-primary/25"
          style={{ animation: "sd-text 2.4s 1.2s ease-in-out infinite" }} />
      </div>
    )
  },
  {
    title: "Advanced Analytics",
    visualization: (
      <div className="relative flex h-20 items-end justify-center gap-1.5 px-2">
        <div className="h-8  w-4 origin-bottom rounded-t bg-primary/50" style={{ animation: "sd-bar 2s .1s ease-in-out infinite" }} />
        <div className="h-12 w-4 origin-bottom rounded-t bg-primary/70" style={{ animation: "sd-bar 2s .3s ease-in-out infinite" }} />
        <div className="h-6  w-4 origin-bottom rounded-t bg-primary/40" style={{ animation: "sd-bar 2s .5s ease-in-out infinite" }} />
        <div className="h-16 w-4 origin-bottom rounded-t bg-primary"    style={{ animation: "sd-bar 2s .7s ease-in-out infinite" }} />
        <div className="h-10 w-4 origin-bottom rounded-t bg-primary/60" style={{ animation: "sd-bar 2s .9s ease-in-out infinite" }} />
        {/* Insight sparkle above tallest bar */}
        <div className="absolute bottom-[4.2rem] left-1/2 -translate-x-1/2">
          <svg viewBox="0 0 10 10" className="h-3.5 w-3.5 text-primary" fill="currentColor"
            style={{ animation: "sd-spark 1.5s ease-in-out infinite" }}>
            <path d="M5 0l1 3.5 3.5 1-3.5 1-1 3.5-1-3.5-3.5-1 3.5-1z"/>
          </svg>
        </div>
      </div>
    )
  },
]

export default function SmartDashboardProductPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Global keyframes for dashboard visualizations */}
      <style>{`
        @keyframes sd-bar     { 0%,100%{transform:scaleY(.15);opacity:.25} 60%{transform:scaleY(1);opacity:1} }
        @keyframes sd-draw    { 0%{stroke-dashoffset:105;opacity:.2} 70%,100%{stroke-dashoffset:0;opacity:1} }
        @keyframes sd-dot     { 0%,100%{transform:scale(.3);opacity:.2} 70%,100%{transform:scale(1);opacity:1} }
        @keyframes sd-timeline{ 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.5);opacity:1} }
        @keyframes sd-text    { 0%,100%{transform:scaleX(.1);opacity:.15} 55%{transform:scaleX(1);opacity:1} }
        @keyframes sd-spark   { 0%,100%{transform:scale(.5) rotate(0deg);opacity:.3} 50%{transform:scale(1.2) rotate(20deg);opacity:1} }
      `}</style>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <FadeUp>
              <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                Visual clarity from structured data.
              </h1>
            </FadeUp>
            <FadeUp delay={0.1}>
              <p className="mt-6 text-lg text-muted-foreground">
                Smart Dashboard transforms structured document data into intuitive visual insights.
              </p>
            </FadeUp>
            <FadeUp delay={0.18} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/pricing">
                <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                  View Pricing
                </Button>
              </Link>
              <Link href="/products/smart-storage">
                <Button variant="outline" size="lg" className="rounded-xl">
                  See Smart Storage
                </Button>
              </Link>
            </FadeUp>
          </div>
        </section>

        {/* What Smart Dashboard shows */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                What Smart Dashboard shows
              </h2>
              <p className="mt-6 text-xl text-foreground md:text-2xl">
                Dashboards provide visibility into financial activity, document patterns, and categorized summaries generated from structured datasets.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* Example dashboard modules */}
        <section className="border-t border-border px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Example dashboard modules
              </h2>
            </FadeUp>

            <StaggerContainer className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardModules.map((module) => (
                <StaggerItem key={module.title}>
                  <div className="rounded-xl border border-border bg-card p-6">
                    <div className="mb-4 text-sm font-medium text-foreground">{module.title}</div>
                    {module.visualization}
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Relationship to Smart Storage */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-3xl">
            <FadeUp className="text-center">
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
            </FadeUp>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border px-6 py-24">
          <FadeUp className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              Structured data becomes usable insight.
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <StartFreeButton tool="smart-dashboard" />
              <Link href="/pricing">
                <Button variant="outline" size="lg" className="rounded-xl">
                  View Pricing
                </Button>
              </Link>
            </div>
          </FadeUp>
        </section>
      </main>
      <Footer />
    </div>
  )
}
