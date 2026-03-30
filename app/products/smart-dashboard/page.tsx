import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StartFreeButton } from "@/components/start-free-button"

const dashboardModules = [
  { 
    title: "Spending by Category",
    visualization: (
      <div className="flex h-20 items-end justify-center gap-1.5">
        <div className="h-12 w-4 rounded-t bg-primary/60" />
        <div className="h-16 w-4 rounded-t bg-primary/80" />
        <div className="h-8 w-4 rounded-t bg-primary/40" />
        <div className="h-20 w-4 rounded-t bg-primary" />
        <div className="h-10 w-4 rounded-t bg-primary/50" />
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
            points="5,30 20,25 35,28 50,15 65,18 80,10 95,12"
          />
          <circle cx="5" cy="30" r="2" fill="currentColor" />
          <circle cx="20" cy="25" r="2" fill="currentColor" />
          <circle cx="35" cy="28" r="2" fill="currentColor" />
          <circle cx="50" cy="15" r="2" fill="currentColor" />
          <circle cx="65" cy="18" r="2" fill="currentColor" />
          <circle cx="80" cy="10" r="2" fill="currentColor" />
          <circle cx="95" cy="12" r="2" fill="currentColor" />
        </svg>
      </div>
    )
  },
  { 
    title: "Income vs Expense",
    visualization: (
      <div className="flex h-20 items-center justify-center gap-6">
        <div className="flex flex-col items-center">
          <div className="h-14 w-8 rounded bg-primary" />
          <span className="mt-1 text-[10px] text-muted-foreground">In</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="h-10 w-8 rounded bg-primary/50" />
          <span className="mt-1 text-[10px] text-muted-foreground">Out</span>
        </div>
      </div>
    )
  },
  { 
    title: "Document Type Distribution",
    visualization: (
      <div className="flex h-20 items-center justify-center">
        <svg viewBox="0 0 60 60" className="h-16 w-16">
          <circle cx="30" cy="30" r="25" fill="none" stroke="currentColor" strokeWidth="8" className="text-primary/30" />
          <circle 
            cx="30" 
            cy="30" 
            r="25" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeDasharray="95 62"
            strokeDashoffset="0"
            className="text-primary" 
          />
          <circle 
            cx="30" 
            cy="30" 
            r="25" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeDasharray="40 117"
            strokeDashoffset="-95"
            className="text-primary/60" 
          />
        </svg>
      </div>
    )
  },
  { 
    title: "Activity Timeline",
    visualization: (
      <div className="flex h-20 items-center justify-center px-4">
        <div className="relative flex w-full items-center">
          <div className="h-0.5 w-full bg-border" />
          <div className="absolute left-[10%] h-3 w-3 rounded-full bg-primary" />
          <div className="absolute left-[30%] h-3 w-3 rounded-full bg-primary/70" />
          <div className="absolute left-[55%] h-3 w-3 rounded-full bg-primary/80" />
          <div className="absolute left-[75%] h-3 w-3 rounded-full bg-primary/60" />
          <div className="absolute left-[90%] h-3 w-3 rounded-full bg-primary" />
        </div>
      </div>
    )
  },
]

export default function SmartDashboardProductPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Visual clarity from structured data.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Smart Dashboard transforms structured document data into intuitive visual insights.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
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
            </div>
          </div>
        </section>

        {/* What Smart Dashboard shows */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-4xl">
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
        <section className="border-t border-border px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Example dashboard modules
              </h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardModules.map((module) => (
                <div
                  key={module.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="mb-4 text-sm font-medium text-foreground">{module.title}</div>
                  {module.visualization}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Relationship to Smart Storage */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-3xl">
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
        <section className="border-t border-border px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
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
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}