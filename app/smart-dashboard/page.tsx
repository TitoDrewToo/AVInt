"use client"

import { useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { AuthGuardModal, DEV_FORCE_LOGGED_IN } from "@/components/auth-guard-modal"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { ChevronDown, Star, Search, GripVertical } from "lucide-react"

// Widget types for the canvas
interface Widget {
  id: string
  type: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

// Standard visuals available
const standardVisuals = [
  { id: "expense-trend", label: "Expense Trend", available: true },
  { id: "monthly-spending", label: "Monthly Spending", available: true },
  { id: "income-expense", label: "Income vs Expense", available: false },
  { id: "category-dist", label: "Category Distribution", available: true },
  { id: "vendor-freq", label: "Vendor Frequency", available: false },
  { id: "tax-deduction", label: "Tax Deduction Summary", available: false },
]

// Custom visuals (user-saved)
const customVisuals = [
  { id: "custom-1", label: "Q4 Travel Analysis", nickname: "Travel", favorite: true },
  { id: "custom-2", label: "Office Supplies Trend", nickname: null, favorite: false },
  { id: "custom-3", label: "Client Invoice Summary", nickname: "Invoices", favorite: true },
]

// Initial placeholder widgets
const initialWidgets: Widget[] = [
  { id: "w1", type: "expense-trend", title: "Expense Trend", x: 0, y: 0, width: 2, height: 2 },
  { id: "w2", type: "monthly-spending", title: "Monthly Spending", x: 2, y: 0, width: 2, height: 2 },
  { id: "w3", type: "category-dist", title: "Category Distribution", x: 0, y: 2, width: 2, height: 2 },
]

// Placeholder chart components
function LineChartPlaceholder() {
  return (
    <svg viewBox="0 0 100 50" className="h-full w-full text-primary">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points="5,40 20,35 35,38 50,20 65,25 80,15 95,18"
      />
      {[
        { x: 5, y: 40 },
        { x: 20, y: 35 },
        { x: 35, y: 38 },
        { x: 50, y: 20 },
        { x: 65, y: 25 },
        { x: 80, y: 15 },
        { x: 95, y: 18 },
      ].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="currentColor" />
      ))}
    </svg>
  )
}

function BarChartPlaceholder() {
  return (
    <div className="flex h-full items-end justify-center gap-2 pb-2">
      <div className="h-[40%] w-6 rounded-t bg-primary/60" />
      <div className="h-[70%] w-6 rounded-t bg-primary/80" />
      <div className="h-[50%] w-6 rounded-t bg-primary/40" />
      <div className="h-[90%] w-6 rounded-t bg-primary" />
      <div className="h-[60%] w-6 rounded-t bg-primary/50" />
    </div>
  )
}

function PieChartPlaceholder() {
  return (
    <svg viewBox="0 0 60 60" className="h-full w-full">
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
  )
}

function WidgetContent({ type }: { type: string }) {
  switch (type) {
    case "expense-trend":
      return <LineChartPlaceholder />
    case "monthly-spending":
      return <BarChartPlaceholder />
    case "category-dist":
      return <PieChartPlaceholder />
    default:
      return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Widget</div>
  }
}

// Accordion section component
function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

export default function SmartDashboardPage() {
  const [widgets, setWidgets] = useState<Widget[]>(initialWidgets)
  const [selectedWidget, setSelectedWidget] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<"standard" | "custom" | null>("standard")
  const [customSearch, setCustomSearch] = useState("")
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null)

  const toggleSection = (section: "standard" | "custom") => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const addWidgetToCanvas = (type: string, label: string) => {
    // Find next available position
    const occupiedPositions = new Set(widgets.map((w) => `${w.x},${w.y}`))
    let newX = 0
    let newY = 0

    // Find first available 2x2 slot in grid
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 4; x += 2) {
        if (!occupiedPositions.has(`${x},${y}`)) {
          newX = x
          newY = y
          break
        }
      }
      if (!occupiedPositions.has(`${newX},${newY}`)) break
    }

    const newWidget: Widget = {
      id: `w${Date.now()}`,
      type,
      title: label,
      x: newX,
      y: newY,
      width: 2,
      height: 2,
    }
    setWidgets([...widgets, newWidget])
  }

  const sortedCustomVisuals = [...customVisuals]
    .filter((v) => !customSearch || v.label.toLowerCase().includes(customSearch.toLowerCase()))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))

  // DEV PREVIEW ONLY
  const isSignedIn = false

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      {/* Auth Guard Modal */}
      <AuthGuardModal isVisible={!isSignedIn} />

      {/* Workspace Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* MAIN WORKSPACE (80%) */}
        <div className="flex w-[80%] flex-col">
          {/* Top Toolbar */}
          <div className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
            <div className="text-sm text-muted-foreground">
              {selectedWidget ? (
                <span>
                  Selected: <span className="text-foreground">{widgets.find((w) => w.id === selectedWidget)?.title}</span>
                </span>
              ) : (
                <span>Select a widget to configure</span>
              )}
            </div>

            {/* Placeholder controls - right aligned */}
            <div className="flex items-center gap-2">
              <button
                disabled={!selectedWidget}
                className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Date Range
              </button>
              <button
                disabled={!selectedWidget}
                className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Theme
              </button>
              <button
                disabled={!selectedWidget}
                className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Filter
              </button>
              <button
                disabled={!selectedWidget}
                className="rounded px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Aggregate
              </button>
              <div className="ml-2">
                <ProcessingIndicator active={false} />
              </div>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 overflow-auto bg-muted/20 p-6">
            {/* Grid Canvas */}
            <div
              className="relative min-h-[600px] rounded-lg border border-dashed border-border/60 bg-background p-4"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gridAutoRows: "150px",
                gap: "16px",
              }}
            >
              {widgets.map((widget) => (
                <div
                  key={widget.id}
                  className={`group relative cursor-pointer rounded-xl border bg-card p-4 transition-all ${
                    selectedWidget === widget.id
                      ? "border-primary ring-1 ring-primary/20"
                      : "border-border hover:border-border/80 hover:shadow-sm"
                  } ${draggedWidget === widget.id ? "opacity-50" : ""}`}
                  style={{
                    gridColumn: `span ${widget.width}`,
                    gridRow: `span ${widget.height}`,
                  }}
                  onClick={() => setSelectedWidget(widget.id)}
                  draggable
                  onDragStart={() => setDraggedWidget(widget.id)}
                  onDragEnd={() => setDraggedWidget(null)}
                >
                  {/* Drag handle */}
                  <div className="absolute left-2 top-2 cursor-grab opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Widget title */}
                  <div className="mb-2 text-xs font-medium text-foreground">{widget.title}</div>

                  {/* Widget content */}
                  <div className="h-[calc(100%-24px)]">
                    <WidgetContent type={widget.type} />
                  </div>
                </div>
              ))}

              {/* Empty state hint */}
              {widgets.length === 0 && (
                <div className="col-span-4 flex items-center justify-center py-20 text-sm text-muted-foreground">
                  Select a visual from the right panel to add to your dashboard
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Visual Controls (20%) */}
        <aside className="flex w-[20%] min-w-[220px] flex-col border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Visuals</h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Standard Visuals */}
            <AccordionSection
              title="Standard"
              isOpen={expandedSection === "standard"}
              onToggle={() => toggleSection("standard")}
            >
              <div className="space-y-1">
                {standardVisuals.map((visual) => (
                  <button
                    key={visual.id}
                    disabled={!visual.available}
                    onClick={() => visual.available && addWidgetToCanvas(visual.id, visual.label)}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      visual.available
                        ? "text-foreground hover:bg-muted"
                        : "cursor-not-allowed text-muted-foreground/50"
                    }`}
                  >
                    {visual.label}
                  </button>
                ))}
              </div>
            </AccordionSection>

            {/* Custom Visuals */}
            <AccordionSection
              title="Custom"
              isOpen={expandedSection === "custom"}
              onToggle={() => toggleSection("custom")}
            >
              {/* Search (shown when list grows) */}
              {customVisuals.length > 3 && (
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search custom visuals..."
                    value={customSearch}
                    onChange={(e) => setCustomSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}

              <div className="space-y-1">
                {sortedCustomVisuals.map((visual) => (
                  <button
                    key={visual.id}
                    onClick={() => addWidgetToCanvas(visual.id, visual.nickname || visual.label)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="truncate">
                      {visual.nickname ? (
                        <>
                          <span>{visual.nickname}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({visual.label})</span>
                        </>
                      ) : (
                        visual.label
                      )}
                    </span>
                    {visual.favorite && <Star className="h-3 w-3 fill-primary text-primary" />}
                  </button>
                ))}

                {sortedCustomVisuals.length === 0 && (
                  <p className="py-2 text-xs text-muted-foreground">No custom visuals found</p>
                )}
              </div>
            </AccordionSection>
          </div>
        </aside>
      </div>

      <Footer />
    </div>
  )
}
