import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"

// Refined dimensional icons for how-it-works section
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes upload-arrow {
          0%, 100% { transform: translateY(0); opacity: 1; }
          40% { transform: translateY(-3px); opacity: 0.6; }
          70% { transform: translateY(-1px); opacity: 1; }
        }
        @keyframes upload-dot {
          0%, 100% { opacity: 1; r: 3; }
          50% { opacity: 0.3; r: 2; }
        }
        .upload-arrow { animation: upload-arrow 2s ease-in-out infinite; transform-origin: 16px 18px; }
        .upload-dot { animation: upload-dot 1.2s ease-in-out infinite; }
      `}</style>
      <rect x="6" y="4" width="20" height="24" rx="2" className="fill-muted stroke-border" strokeWidth="0.75" />
      <path d="M20 4V10H26" className="stroke-border" strokeWidth="0.75" />
      <path d="M20 4L26 10V28" className="fill-card stroke-border" strokeWidth="0.75" />
      <g className="upload-arrow">
        <path d="M16 22V14M16 14L12 18M16 14L20 18" className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="24" cy="6" r="3" fill="rgb(239 68 68)" className="upload-dot" />
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

function DashboardIcon({ className }: { className?: string }) {
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
        @keyframes bar-grow-3 {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
        @keyframes bar-grow-4 {
          0%, 100% { transform: scaleY(0.8); }
          50% { transform: scaleY(1); }
        }
        @keyframes line-draw {
          0% { stroke-dashoffset: 40; opacity: 0.3; }
          60% { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .bar-1 { animation: bar-grow-1 2.4s ease-in-out infinite 0s; transform-origin: 8.5px 26px; }
        .bar-2 { animation: bar-grow-2 2.4s ease-in-out infinite 0.3s; transform-origin: 13.5px 26px; }
        .bar-3 { animation: bar-grow-3 2.4s ease-in-out infinite 0.6s; transform-origin: 18.5px 26px; }
        .bar-4 { animation: bar-grow-4 2.4s ease-in-out infinite 0.9s; transform-origin: 23.5px 26px; }
        .trend-line { stroke-dasharray: 40; animation: line-draw 2.4s ease-in-out infinite; }
      `}</style>
      <rect x="4" y="4" width="24" height="24" rx="2" className="fill-card stroke-border" strokeWidth="0.75" />
      <rect x="4" y="4" width="24" height="6" rx="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="8" cy="7" r="1" className="fill-primary/60" />
      <circle cx="12" cy="7" r="1" className="fill-muted-foreground/30" />
      <circle cx="16" cy="7" r="1" className="fill-muted-foreground/30" />
      <rect x="7" y="20" width="3" height="6" rx="0.5" className="fill-muted bar-1" />
      <rect x="12" y="16" width="3" height="10" rx="0.5" className="fill-primary/40 bar-2" />
      <rect x="17" y="18" width="3" height="8" rx="0.5" className="fill-muted bar-3" />
      <rect x="22" y="14" width="3" height="12" rx="0.5" className="fill-primary/20 bar-4" />
      <path d="M8.5 17L13.5 13L18.5 15L23.5 11" className="stroke-primary trend-line" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
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
        <FadeUp>
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
            How it works
          </h2>
        </FadeUp>
        <StaggerContainer className="mt-16 flex flex-col items-center justify-between gap-12 md:flex-row md:gap-8">
          {steps.map((step, index) => (
            <StaggerItem key={step.number} className="flex items-center">
              <Step {...step} />
              {index < steps.length - 1 && (
                <div className="ml-8 hidden h-px w-24 bg-border md:block" />
              )}
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
