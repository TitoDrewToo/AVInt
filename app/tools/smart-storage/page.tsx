"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import { 
  Folder, 
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  File
} from "lucide-react"

// User folder tree structure
const userFolders = [
  {
    name: "Documents",
    children: [
      {
        name: "Receipts",
        children: [
          { name: "2026", children: [] },
          { name: "2025", children: [] },
        ],
      },
      { name: "Invoices", children: [] },
      { name: "Contracts", children: [] },
    ],
  },
  { name: "Personal", children: [] },
  { name: "Business", children: [] },
]

// Classification folders (system-driven)
const classificationFolders = [
  { name: "Unclassified", count: 0 },
  { name: "Receipts", count: 0 },
  { name: "Income", count: 0 },
  { name: "Tax", count: 0 },
  { name: "Contracts", count: 0 },
  { name: "Legal", count: 0 },
  { name: "Other", count: 0 },
]

// Workspace folders (for grid display)
const workspaceFolders = [
  { name: "Receipts 2026" },
  { name: "Invoices" },
  { name: "Contracts" },
  { name: "Tax Documents" },
]

// Report categories with availability
const reportCategories = [
  {
    name: "Expenses",
    reports: [
      { name: "Monthly Summary", available: true },
      { name: "Category Breakdown", available: true },
      { name: "Vendor Analysis", available: false },
    ],
  },
  {
    name: "Income",
    reports: [
      { name: "Revenue Report", available: false },
      { name: "Income Sources", available: false },
    ],
  },
  {
    name: "Tax",
    reports: [
      { name: "Deductions Summary", available: false },
      { name: "Annual Overview", available: false },
    ],
  },
  {
    name: "Documents",
    reports: [
      { name: "Document Inventory", available: true },
      { name: "Processing Status", available: true },
    ],
  },
  {
    name: "Business",
    reports: [
      { name: "Cash Flow", available: false },
      { name: "Profit & Loss", available: false },
    ],
  },
  {
    name: "Legal",
    reports: [
      { name: "Contract Summary", available: false },
      { name: "Expiration Tracker", available: false },
    ],
  },
]

// Folder tree component
function FolderTreeItem({ 
  folder, 
  level = 0,
  selectedFolder,
  onSelect
}: { 
  folder: { name: string; children?: { name: string; children?: any[] }[] }
  level?: number
  selectedFolder: string | null
  onSelect: (name: string) => void
}) {
  const [isOpen, setIsOpen] = useState(level === 0)
  const hasChildren = folder.children && folder.children.length > 0
  const isSelected = selectedFolder === folder.name

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.name)
          if (hasChildren) setIsOpen(!isOpen)
        }}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {isOpen && hasChildren ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{folder.name}</span>
      </button>
      {isOpen && hasChildren && (
        <div>
          {folder.children!.map((child) => (
            <FolderTreeItem
              key={child.name}
              folder={child}
              level={level + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Report category component
function ReportCategory({ 
  category 
}: { 
  category: { name: string; reports: { name: string; available: boolean }[] } 
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
      >
        <span className="font-medium">{category.name}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="ml-2 space-y-0.5 border-l border-border pl-3 pt-1">
          {category.reports.map((report) => (
            <button
              key={report.name}
              disabled={!report.available}
              className={`block w-full rounded px-2 py-1 text-left text-sm transition-colors ${
                report.available
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "cursor-not-allowed text-muted-foreground/40"
              }`}
            >
              {report.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SmartStoragePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    // UI only - no upload logic
  }

  if (!session) {
    return <AuthGuardModal isVisible={true} />
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      {/* Workspace */}
      <main className="flex flex-1">
        {/* Three-pane layout */}
        <div className="flex flex-1">
          
          {/* LEFT PANE - Folder Navigation (15%) */}
          <aside className="flex w-[15%] min-w-[180px] flex-col border-r border-border bg-card">
            {/* User Folders (60%) */}
            <div className="flex-[0.6] overflow-y-auto border-b border-border p-3">
              {/* Processing indicator - top right */}
              <div className="mb-2 flex justify-end">
                <ProcessingIndicator active={true} />
              </div>
              <div className="space-y-0.5">
                {userFolders.map((folder) => (
                  <FolderTreeItem
                    key={folder.name}
                    folder={folder}
                    selectedFolder={selectedFolder}
                    onSelect={setSelectedFolder}
                  />
                ))}
              </div>
            </div>

            {/* Classification Folders (40%) */}
            <div className="flex-[0.4] overflow-y-auto p-3">
              <span className="mb-2 block px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Classification
              </span>
              <div className="space-y-0.5">
                {classificationFolders.map((folder) => (
                  <button
                    key={folder.name}
                    onClick={() => setSelectedFolder(folder.name)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
                      selectedFolder === folder.name
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* CENTER PANE - Workspace (65%) */}
          <div
            className={`relative flex w-[65%] flex-col bg-background p-6 transition-colors ${
              isDragOver ? "bg-primary/5" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Folder Grid */}
            {workspaceFolders.length > 0 && (
              <div className="mb-8 grid grid-cols-4 gap-4">
                {workspaceFolders.map((folder) => (
                  <button
                    key={folder.name}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted"
                  >
                    <Folder className="h-10 w-10 text-primary/70" />
                    <span className="text-center text-sm text-foreground">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Drag & Drop Hint */}
            <div
              className={`flex flex-1 flex-col items-center justify-center ${
                workspaceFolders.length > 0 ? "opacity-50" : ""
              }`}
            >
              {/* Silhouette file icons */}
              <div className="relative mb-6 flex items-end justify-center gap-2">
                <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted/50">
                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-muted/50">
                  <File className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">Drag & drop files here</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground/60">PDF</span>
                <span className="text-xs text-muted-foreground/60">JPG</span>
                <span className="text-xs text-muted-foreground/60">JPEG</span>
                <span className="text-xs text-muted-foreground/60">PNG</span>
                <span className="text-xs text-muted-foreground/60">WEBP</span>
                <span className="text-xs text-muted-foreground/60">HEIC</span>
              </div>
            </div>
          </div>

          {/* RIGHT PANE - Report Generator (20%) */}
          <aside className="flex w-[20%] min-w-[180px] flex-col border-l border-border bg-card p-4">
            <h2 className="mb-4 text-sm font-semibold text-foreground">Reports</h2>
            
            <Button className="mb-6 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
              Generate Report
            </Button>

            <div className="flex-1 space-y-1 overflow-y-auto">
              {reportCategories.map((category) => (
                <ReportCategory key={category.name} category={category} />
              ))}
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  )
}