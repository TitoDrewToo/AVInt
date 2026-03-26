// Refined dimensional icons for how-it-works section
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document base */}
      <rect x="6" y="4" width="20" height="24" rx="2" className="fill-muted stroke-border" strokeWidth="0.75" />
      {/* Document fold */}
      <path d="M20 4V10H26" className="stroke-border" strokeWidth="0.75" />
      <path d="M20 4L26 10V28" className="fill-card stroke-border" strokeWidth="0.75" />
      {/* Upload arrow */}
      <path d="M16 22V14M16 14L12 18M16 14L20 18" className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Highlight accent */}
      <circle cx="24" cy="6" r="3" className="fill-primary/80" />
    </svg>
  )
}

function ProcessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Central processor */}
      <rect x="10" y="10" width="12" height="12" rx="2" className="fill-card stroke-border" strokeWidth="0.75" />
      {/* Inner detail */}
      <rect x="13" y="13" width="6" height="6" rx="1" className="fill-primary/20 stroke-primary/40" strokeWidth="0.5" />
      {/* Connection lines */}
      <path d="M16 4V10M16 22V28" className="stroke-muted-foreground/50" strokeWidth="1" strokeLinecap="round" />
      <path d="M4 16H10M22 16H28" className="stroke-muted-foreground/50" strokeWidth="1" strokeLinecap="round" />
      {/* Corner nodes */}
      <circle cx="6" cy="6" r="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="26" cy="6" r="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="6" cy="26" r="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="26" cy="26" r="2" className="fill-primary/60" strokeWidth="0.5" />
      {/* Active indicator */}
      <circle cx="16" cy="16" r="1.5" className="fill-primary" />
    </svg>
  )
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Main panel */}
      <rect x="4" y="4" width="24" height="24" rx="2" className="fill-card stroke-border" strokeWidth="0.75" />
      {/* Header bar */}
      <rect x="4" y="4" width="24" height="6" rx="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="8" cy="7" r="1" className="fill-primary/60" />
      <circle cx="12" cy="7" r="1" className="fill-muted-foreground/30" />
      <circle cx="16" cy="7" r="1" className="fill-muted-foreground/30" />
      {/* Chart bars */}
      <rect x="7" y="20" width="3" height="6" rx="0.5" className="fill-muted" />
      <rect x="12" y="16" width="3" height="10" rx="0.5" className="fill-primary/40" />
      <rect x="17" y="18" width="3" height="8" rx="0.5" className="fill-muted" />
      <rect x="22" y="14" width="3" height="12" rx="0.5" className="fill-primary/20" />
      {/* Trend line */}
      <path d="M8.5 17L13.5 13L18.5 15L23.5 11" className="stroke-primary" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface StepProps {
  number: number
  title: string
  icon: React.ReactNode
}

function Step({ number, title, icon }: StepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
          {icon}
        </div>
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          {number}
        </span>
      </div>
      <h3 className="mt-6 text-base font-medium text-foreground">{title}</h3>
    </div>
  )
}

const steps: StepProps[] = [
  {
    number: 1,
    title: "Upload documents",
    icon: <UploadIcon className="h-8 w-8" />,
  },
  {
    number: 2,
    title: "AI structures data",
    icon: <ProcessIcon className="h-8 w-8" />,
  },
  {
    number: 3,
    title: "Reports and dashboards generated",
    icon: <DashboardIcon className="h-8 w-8" />,
  },
]

export function HowItWorksSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
          How it works
        </h2>
        <div className="mt-16 flex flex-col items-center justify-between gap-12 md:flex-row md:gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center">
              <Step {...step} />
              {index < steps.length - 1 && (
                <div className="ml-8 hidden h-px w-24 bg-border md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
