import Link from "next/link"
import { ArrowUpRight, BarChart3, ClipboardList, FileSpreadsheet } from "lucide-react"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"

const reports = [
  { title: "Expense report", description: "Vendor, date, category, amount, and business/personal review in one clean table.", icon: ClipboardList },
  { title: "Recurring spend view", description: "See subscriptions and repeat charges before they quietly become overhead.", icon: BarChart3 },
  { title: "Accountant-ready CSV", description: "Export categorized transactions to continue the work in your books or with your preparer.", icon: FileSpreadsheet },
]

export function SampleReportsSection() {
  return (
    <section className="marketing-scroll-section relative px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Sample outputs</p>
          <h2 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-tight text-foreground md:text-5xl">Your documents should leave you with decisions, not another filing system.</h2>
        </FadeUp>
        <StaggerContainer className="mt-10 grid gap-4 md:grid-cols-3">
          {reports.map(({ title, description, icon: Icon }) => (
            <StaggerItem key={title}>
              <div className="glass-surface flex h-full flex-col rounded-2xl p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
                <Link href="/tools/smart-storage" target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Explore Smart Storage <ArrowUpRight className="h-4 w-4" /></Link>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
