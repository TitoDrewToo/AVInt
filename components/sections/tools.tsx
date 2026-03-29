import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

// Refined dimensional icons
function StorageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Stacked documents effect */}
      <rect x="6" y="2" width="14" height="18" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="4" y="4" width="14" height="18" rx="1.5" className="fill-card stroke-border" strokeWidth="0.5" />
      {/* Document lines */}
      <rect x="7" y="8" width="8" height="1" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="7" y="11" width="6" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="7" y="14" width="7" height="1" rx="0.5" className="fill-muted-foreground/20" />
      {/* Processing indicator */}
      <circle cx="16" cy="6" r="2.5" className="fill-primary" />
      <path d="M15 6L15.75 6.75L17 5.5" className="stroke-primary-foreground" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Panel background */}
      <rect x="2" y="3" width="20" height="18" rx="2" className="fill-card stroke-border" strokeWidth="0.5" />
      {/* Header */}
      <rect x="2" y="3" width="20" height="4" rx="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="5" cy="5" r="1" className="fill-primary/60" />
      {/* Chart area */}
      <rect x="4" y="14" width="3" height="5" rx="0.5" className="fill-muted" />
      <rect x="9" y="11" width="3" height="8" rx="0.5" className="fill-primary/30" />
      <rect x="14" y="13" width="3" height="6" rx="0.5" className="fill-muted" />
      {/* Trend line */}
      <path d="M5.5 12L10.5 9L15.5 10.5" className="stroke-primary" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.5" cy="9" r="1.5" className="fill-primary" />
    </svg>
  )
}

interface ToolCardProps {
  name: string
  description: string
  subtext: string
  href: string
  icon: React.ReactNode
}

function ToolCard({ name, description, subtext, href, icon }: ToolCardProps) {
  return (
    <Link href={href}>
      <div className="group flex h-full flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/20 hover:shadow-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
          {icon}
        </div>
        <h3 className="mt-6 text-xl font-semibold text-foreground">{name}</h3>
        <p className="mt-3 text-muted-foreground">{description}</p>
        <p className="mt-2 text-sm text-muted-foreground/80">{subtext}</p>
        <div className="mt-6 flex items-center text-sm font-medium text-primary">
          Learn more
          <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>
    </Link>
  )
}

const tools: ToolCardProps[] = [
  {
    name: "Smart Storage",
    description:
      "Upload documents once. Automatically structure receipts, invoices, and records.",
    subtext: "Generate organized datasets ready for reporting.",
    href: "/products/smart-storage",
    icon: <StorageIcon className="h-6 w-6" />,
  },
  {
    name: "Smart Dashboard",
    description:
      "Transform structured information into clear visual insights.",
    subtext: "Interactive dashboards built from real activity data.",
    href: "/products/smart-dashboard",
    icon: <DashboardIcon className="h-6 w-6" />,
  },
]

export function ToolsSection() {
  return (
    <section id="tools" className="border-t border-border bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
          Tools
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool.name} {...tool} />
          ))}
        </div>
      </div>
    </section>
  )
}
