import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

type StatusType = "live" | "development" | "coming-soon"

interface ProductCardProps {
  name: string
  description: string
  status?: StatusType
  href?: string
  external?: boolean
  disabled?: boolean
  icon?: React.ReactNode
}

function StatusBadge({ status }: { status: StatusType }) {
  if (status === "coming-soon") return null

  const styles = {
    live: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
    development: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800",
    "coming-soon": "",
  }

  const dotColors = {
    live: "bg-emerald-500",
    development: "bg-amber-500",
    "coming-soon": "",
  }

  const labels = {
    live: "Live Testing",
    development: "In Development",
    "coming-soon": "",
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      <style>{`
        @keyframes badgePulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 0 0 currentColor; }
          50% { opacity: 0.7; transform: scale(1.2); box-shadow: 0 0 0 3px transparent; }
        }
        @keyframes glowRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--pulse-color), 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(var(--pulse-color), 0); }
        }
        .dot-live { animation: badgePulse 2s ease-in-out infinite; }
        .dot-dev { animation: badgePulse 2.5s ease-in-out infinite 0.5s; }
      `}</style>
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotColors[status]} ${status === "live" ? "dot-live" : "dot-dev"}`}
      />
      {labels[status]}
    </span>
  )
}

// Refined dimensional product icons
function PicklePalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes pp-ring { 0%,100%{opacity:0.3;r:3} 50%{opacity:1;r:3.5} }
        @keyframes pp-core { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .pp-r { animation: pp-ring 2s ease-in-out infinite; }
        .pp-c { animation: pp-core 2s ease-in-out infinite; }
      `}</style>
      <circle cx="12" cy="12" r="9" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="12" cy="12" r="6" className="fill-card stroke-border" strokeWidth="0.5" />
      <circle cx="12" cy="12" r="3" fill="rgba(220,38,38,0.2)" stroke="rgba(220,38,38,0.4)" strokeWidth="0.5" className="pp-r" />
      <circle cx="12" cy="12" r="1" fill="rgb(220,38,38)" className="pp-c" />
    </svg>
  )
}

function HooperIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes hoop-ellipse { 0%,100%{opacity:0.3;ry:3} 50%{opacity:1;ry:4} }
        @keyframes hoop-spoke { 0%,100%{opacity:0.2} 50%{opacity:0.8} }
        .he { animation: hoop-ellipse 2.2s ease-in-out infinite; }
        .hs1 { animation: hoop-spoke 2.2s ease-in-out infinite 0s; }
        .hs2 { animation: hoop-spoke 2.2s ease-in-out infinite 0.4s; }
        .hs3 { animation: hoop-spoke 2.2s ease-in-out infinite 0.8s; }
      `}</style>
      <circle cx="12" cy="12" r="9" className="fill-muted stroke-border" strokeWidth="0.5" />
      <path d="M12 3L12 12" stroke="rgb(220,38,38)" strokeWidth="0.5" strokeOpacity="0.5" className="hs1" />
      <path d="M12 12L19.5 7.5" stroke="rgb(220,38,38)" strokeWidth="0.5" strokeOpacity="0.5" className="hs2" />
      <path d="M12 12L4.5 7.5" stroke="rgb(220,38,38)" strokeWidth="0.5" strokeOpacity="0.5" className="hs3" />
      <ellipse cx="12" cy="12" rx="9" ry="3" fill="none" stroke="rgb(220,38,38)" strokeOpacity="0.4" strokeWidth="1" className="he" />
    </svg>
  )
}

function StorageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes prod-upload { 0%,100%{transform:translateY(0);opacity:1} 40%{transform:translateY(-2px);opacity:0.5} 70%{transform:translateY(-1px);opacity:1} }
        @keyframes prod-dot { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .pu { animation: prod-upload 2s ease-in-out infinite; transform-origin: 11px 11px; }
        .pd { animation: prod-dot 1.2s ease-in-out infinite; }
      `}</style>
      <rect x="6" y="2" width="14" height="18" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="4" y="4" width="14" height="18" rx="1.5" className="fill-card stroke-border" strokeWidth="0.5" />
      <rect x="7" y="8" width="8" height="1" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="7" y="11" width="6" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="7" y="14" width="7" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <g className="pu">
        <path d="M11 15v-5M11 10l-2 2M11 10l2 2" stroke="rgb(220,38,38)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="16" cy="6" r="2.5" fill="rgb(220,38,38)" className="pd" />
    </svg>
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes pb1 { 0%,100%{height:5px;y:14px} 50%{height:7px;y:12px} }
        @keyframes pb2 { 0%,100%{height:8px;y:11px} 50%{height:10px;y:9px} }
        @keyframes pb3 { 0%,100%{height:6px;y:13px} 50%{height:8px;y:11px} }
        @keyframes pl { 0%{stroke-dashoffset:20;opacity:0.3} 60%{stroke-dashoffset:0;opacity:1} 100%{stroke-dashoffset:0;opacity:1} }
        .pb1 { animation: pb1 2.2s ease-in-out infinite 0s; }
        .pb2 { animation: pb2 2.6s ease-in-out infinite 0.35s; }
        .pb3 { animation: pb3 2.4s ease-in-out infinite 0.7s; }
        .pl { stroke-dasharray:20; animation: pl 2.4s ease-in-out infinite; }
      `}</style>
      <rect x="2" y="3" width="20" height="18" rx="2" className="fill-card stroke-border" strokeWidth="0.5" />
      <rect x="2" y="3" width="20" height="4" rx="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="5" cy="5" r="1" className="fill-primary/60" />
      <rect x="4" y="14" width="3" height="5" rx="0.5" className="fill-muted pb1" />
      <rect x="9" y="11" width="3" height="8" rx="0.5" className="fill-primary/30 pb2" />
      <rect x="14" y="13" width="3" height="6" rx="0.5" className="fill-muted pb3" />
      <path d="M5.5 12L10.5 9L15.5 10.5" stroke="rgb(220,38,38)" strokeWidth="1" strokeLinecap="round" className="pl" />
    </svg>
  )
}

function ProductCard({
  name,
  description,
  status,
  href,
  external,
  disabled,
  icon,
}: ProductCardProps) {
  const content = (
    <div
      className={`group relative flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all ${disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-primary/20 hover:shadow-md"
        }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        </div>
        {status && <StatusBadge status={status} />}
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground">{description}</p>
      {!disabled && href && (
        <div className="mt-4 flex items-center text-sm font-medium text-primary">
          Learn more
          <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      )}
    </div>
  )

  if (disabled) {
    return content
  }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    )
  }

  return <Link href={href || "#"}>{content}</Link>
}

const products: ProductCardProps[] = [
  {
    name: "PicklePal",
    description: "Social and venue management platform with analytics.",
    status: "live",
    href: "https://picklepalph.com",
    external: true,
    icon: <PicklePalIcon className="h-5 w-5" />,
  },
  {
    name: "Hooper",
    description:
      "Community infrastructure for organized basketball runs and leagues.",
    status: "development",
    disabled: true,
    icon: <HooperIcon className="h-5 w-5" />,
  },
  {
    name: "Smart Storage",
    description: "Upload documents once. Generate structured reports automatically.",
    href: "/products/smart-storage",
    icon: <StorageIcon className="h-5 w-5" />,
  },
  {
    name: "Smart Dashboard",
    description:
      "Visualize financial activity and trends derived from structured data.",
    href: "/products/smart-dashboard",
    icon: <DashboardIcon className="h-5 w-5" />,
  },
]

export function ProductsSection() {
  return (
    <section id="products" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
          Products
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-foreground">
          We develop products that simplify organization, decisions, and workflows.
        </p>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
          Applied intelligence for real-world systems.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {products.map((product) => (
            <ProductCard key={product.name} {...product} />
          ))}
        </div>
      </div>
    </section>
  )
}
