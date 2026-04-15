// Refined dimensional icons for how-it-works section
function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes cloud-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes doc-slide {
          0%, 100% { transform: translateY(0); opacity: 1; }
          30% { transform: translateY(-4px); opacity: 0.4; }
          60% { transform: translateY(-2px); opacity: 0.8; }
        }
        .cloud-body { animation: cloud-float 3s ease-in-out infinite; }
        .doc-1 { animation: doc-slide 2.8s ease-in-out infinite 0s; }
        .doc-2 { animation: doc-slide 2.8s ease-in-out infinite 0.4s; }
        .doc-3 { animation: doc-slide 2.8s ease-in-out infinite 0.8s; }
      `}</style>
      {/* Cloud shape */}
      <g className="cloud-body">
        <path d="M8 18C5.8 18 4 16.2 4 14C4 12.1 5.3 10.5 7.1 10.1C7.5 7.8 9.5 6 12 6C14.1 6 15.8 7.3 16.5 9.1C17 8.7 17.7 8.5 18.5 8.5C20.4 8.5 22 10.1 22 12V12.1C23.7 12.5 25 14 25 15.8C25 17.9 23.3 18 22 18H8Z"
          className="fill-card stroke-border" strokeWidth="0.75" />
      </g>
      {/* Documents going into cloud */}
      <rect x="9" y="21" width="4" height="5" rx="0.5" className="fill-muted stroke-border doc-1" strokeWidth="0.5" />
      <rect x="14" y="21" width="4" height="5" rx="0.5" className="fill-primary/20 stroke-primary/40 doc-2" strokeWidth="0.5" />
      <rect x="19" y="21" width="4" height="5" rx="0.5" className="fill-muted stroke-border doc-3" strokeWidth="0.5" />
      {/* Upload arrows on docs */}
      <path d="M11 24.5V22.5M11 22.5L10 23.5M11 22.5L12 23.5" className="stroke-muted-foreground/60" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 24.5V22.5M16 22.5L15 23.5M16 22.5L17 23.5" className="stroke-primary" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 24.5V22.5M21 22.5L20 23.5M21 22.5L22 23.5" className="stroke-muted-foreground/60" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Notification dot */}
      <circle cx="24" cy="7" r="2.5" fill="rgb(239 68 68)" />
    </svg>
  )
}

function ProcessIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes node-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes center-pulse {
          0%, 100% { opacity: 1; r: 1.5; }
          50% { opacity: 0.5; r: 2.5; }
        }
        @keyframes line-flow {
          0% { stroke-dashoffset: 12; }
          100% { stroke-dashoffset: 0; }
        }
        .node-1 { animation: node-pulse 2s ease-in-out infinite 0s; transform-origin: 6px 6px; }
        .node-2 { animation: node-pulse 2s ease-in-out infinite 0.5s; transform-origin: 26px 6px; }
        .node-3 { animation: node-pulse 2s ease-in-out infinite 1s; transform-origin: 6px 26px; }
        .node-4 { animation: node-pulse 2s ease-in-out infinite 1.5s; transform-origin: 26px 26px; }
        .center-dot { animation: center-pulse 1.5s ease-in-out infinite; }
        .flow-line { stroke-dasharray: 6 2; animation: line-flow 1s linear infinite; }
      `}</style>
      <rect x="10" y="10" width="12" height="12" rx="2" className="fill-card stroke-border" strokeWidth="0.75" />
      <rect x="13" y="13" width="6" height="6" rx="1" className="fill-primary/20 stroke-primary/40" strokeWidth="0.5" />
      <path d="M16 4V10M16 22V28" stroke="currentColor" className="stroke-muted-foreground/50 flow-line" strokeWidth="1" strokeLinecap="round" />
      <path d="M4 16H10M22 16H28" stroke="currentColor" className="stroke-muted-foreground/50 flow-line" strokeWidth="1" strokeLinecap="round" />
      <circle cx="6" cy="6" r="2" className="fill-muted stroke-border node-1" strokeWidth="0.5" />
      <circle cx="26" cy="6" r="2" className="fill-muted stroke-border node-2" strokeWidth="0.5" />
      <circle cx="6" cy="26" r="2" className="fill-muted stroke-border node-3" strokeWidth="0.5" />
      <circle cx="26" cy="26" r="2" className="fill-primary/60 node-4" strokeWidth="0.5" />
      <circle cx="16" cy="16" r="1.5" className="fill-primary center-dot" />
    </svg>
  )
}

function OutputIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes bar-grow-1 {
          0%, 100% { transform: scaleY(0.6); }
          50% { transform: scaleY(1); }
        }
        @keyframes bar-grow-2 {
          0%, 100% { transform: scaleY(0.7); }
          50% { transform: scaleY(1); }
        }
        @keyframes check-pop {
          0%, 80% { opacity: 0; transform: scale(0); }
          90% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes trend-draw {
          0% { stroke-dashoffset: 40; opacity: 0.3; }
          60% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .out-bar-1 { animation: bar-grow-1 2.4s ease-in-out infinite 0s; transform-origin: 6px 26px; }
        .out-bar-2 { animation: bar-grow-2 2.4s ease-in-out infinite 0.3s; transform-origin: 10px 26px; }
        .out-bar-3 { animation: bar-grow-1 2.4s ease-in-out infinite 0.6s; transform-origin: 14px 26px; }
        .out-trend { stroke-dasharray: 40; animation: trend-draw 2.4s ease-in-out infinite; }
        .out-check { animation: check-pop 3s ease-in-out infinite; transform-origin: 25px 7px; }
      `}</style>
      {/* Report page */}
      <rect x="2" y="4" width="18" height="24" rx="1.5" className="fill-card stroke-border" strokeWidth="0.75" />
      {/* Text lines on report */}
      <rect x="5" y="7" width="8" height="1" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="5" y="10" width="12" height="1" rx="0.5" className="fill-muted-foreground/15" />
      <rect x="5" y="12.5" width="10" height="1" rx="0.5" className="fill-muted-foreground/15" />
      {/* Mini bar chart in report */}
      <rect x="5" y="22" width="2" height="4" rx="0.3" className="fill-muted out-bar-1" />
      <rect x="9" y="19" width="2" height="7" rx="0.3" className="fill-primary/40 out-bar-2" />
      <rect x="13" y="20.5" width="2" height="5.5" rx="0.3" className="fill-muted out-bar-3" />
      {/* Trend line */}
      <path d="M6 20L10 16.5L14 18" className="stroke-primary out-trend" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dashboard card overlapping */}
      <rect x="16" y="12" width="14" height="14" rx="1.5" className="fill-card stroke-border" strokeWidth="0.75" />
      <rect x="18" y="14.5" width="5" height="1" rx="0.5" className="fill-primary/40" />
      <rect x="18" y="17" width="10" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="18" y="19.5" width="8" height="1" rx="0.5" className="fill-muted-foreground/15" />
      <rect x="18" y="22" width="6" height="1" rx="0.5" className="fill-muted-foreground/15" />
      {/* Checkmark badge */}
      <g className="out-check">
        <circle cx="25" cy="7" r="4" className="fill-primary" />
        <path d="M23 7L24.5 8.5L27 5.5" stroke="white" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

interface StepProps {
  number: number
  title: string
  subtitle: string
  icon: React.ReactNode
}

function Step({ number, title, subtitle, icon }: StepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div className="glass-surface hover-bloom flex h-16 w-16 items-center justify-center rounded-2xl text-primary">
          {icon}
        </div>
        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
          {number}
        </span>
      </div>
      <h3 className="mt-6 text-base font-medium text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-[200px] text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  )
}

const steps: StepProps[] = [
  {
    number: 1,
    title: "Store in the cloud",
    subtitle: "Receipts, invoices, payslips, contracts — all secure in one place.",
    icon: <CloudIcon className="h-8 w-8" />,
  },
  {
    number: 2,
    title: "AI structures data",
    subtitle: "Fields, amounts, dates, and categories extracted automatically.",
    icon: <ProcessIcon className="h-8 w-8" />,
  },
  {
    number: 3,
    title: "Tax-ready reports & dashboards",
    subtitle: "Schedule C mapped expenses, P&L, CSV export — ready for filing.",
    icon: <OutputIcon className="h-8 w-8" />,
  },
]

export function HowItWorksSection() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
          How it works
        </h2>
        <div className="mt-16 flex flex-col items-center gap-12 md:flex-row md:items-start md:gap-0">
          {steps.map((step, index) => (
            <div key={step.number} className="contents">
              <div className="flex flex-1 justify-center">
                <Step {...step} />
              </div>
              {index < steps.length - 1 && (
                <div className="retro-divider hidden w-24 shrink-0 md:block md:mt-8" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
