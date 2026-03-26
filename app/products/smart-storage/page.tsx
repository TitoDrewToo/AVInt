import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { 
  FileSearch, 
  FileText, 
  Database, 
  FileBarChart, 
  Shield, 
  FolderOpen,
  Upload,
  Layers,
  FileOutput
} from "lucide-react"

const supportedFiles = [
  "Receipts",
  "Invoices", 
  "Income records",
  "Contracts",
  "Statements",
]

const capabilities = [
  { 
    icon: <FileSearch className="h-5 w-5" />, 
    title: "Document classification",
    description: "Automatically identify and categorize document types"
  },
  { 
    icon: <FileText className="h-5 w-5" />, 
    title: "Field extraction",
    description: "Pull key data points from unstructured documents"
  },
  { 
    icon: <Database className="h-5 w-5" />, 
    title: "Structured datasets",
    description: "Convert documents into organized, queryable data"
  },
  { 
    icon: <FileBarChart className="h-5 w-5" />, 
    title: "Report generation",
    description: "Create summaries and reports from extracted data"
  },
  { 
    icon: <Shield className="h-5 w-5" />, 
    title: "Secure storage",
    description: "Keep your documents protected and encrypted"
  },
  { 
    icon: <FolderOpen className="h-5 w-5" />, 
    title: "Organized retrieval",
    description: "Find and access documents quickly when needed"
  },
]

const workflowSteps = [
  { 
    icon: <Upload className="h-6 w-6" />, 
    title: "Upload documents",
    step: "01"
  },
  { 
    icon: <Layers className="h-6 w-6" />, 
    title: "Data becomes structured",
    step: "02"
  },
  { 
    icon: <FileOutput className="h-6 w-6" />, 
    title: "Reports available when needed",
    step: "03"
  },
]

export default function SmartStorageProductPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Structure your real-world documents automatically.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Smart Storage transforms receipts, invoices, and records into organized data ready for reporting and analysis.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/pricing">
                <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                  View Pricing
                </Button>
              </Link>
              <Link href="/smart-dashboard">
                <Button variant="outline" size="lg" className="rounded-xl">
                  Explore Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* What Smart Storage does */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                What Smart Storage does
              </h2>
              <p className="mt-6 text-xl text-foreground md:text-2xl">
                Smart Storage converts everyday documents into structured datasets that can be used for reporting, tracking, and reference.
              </p>
            </div>

            {/* Supported files */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              {supportedFiles.map((file) => (
                <span
                  key={file}
                  className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground"
                >
                  {file}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Core capabilities */}
        <section className="border-t border-border px-6 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Core capabilities
              </h2>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <div
                  key={capability.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {capability.icon}
                  </div>
                  <h3 className="mt-4 font-medium text-foreground">{capability.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{capability.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow simplicity */}
        <section className="border-t border-border bg-muted/30 px-6 py-24">
          <div className="mx-auto max-w-4xl">
            <div className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Workflow simplicity
              </h2>
            </div>

            <div className="mt-12 flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-4">
              {workflowSteps.map((step, index) => (
                <div key={step.title} className="flex items-center gap-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-primary">
                      {step.icon}
                    </div>
                    <span className="mt-3 text-xs font-medium text-primary">{step.step}</span>
                    <span className="mt-1 text-sm font-medium text-foreground">{step.title}</span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className="hidden h-px w-16 bg-border md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border px-6 py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              Upload once. Use repeatedly.
            </h2>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                Start Free
              </Button>
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