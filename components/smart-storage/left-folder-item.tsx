"use client"

import type { ReactNode } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, Pencil, X } from "lucide-react"

interface LeftFolderItemProps {
  name: string
  isOpen?: boolean
  isSelected: boolean
  onSelect: () => void
  onToggle?: () => void
  children?: ReactNode
  level?: number
  onRename?: () => void
  onDelete?: () => void
}

export function LeftFolderItem({
  name,
  isOpen,
  isSelected,
  onSelect,
  onToggle,
  children,
  level = 0,
  onRename,
  onDelete,
}: LeftFolderItemProps) {
  return (
    <div>
      <div
        className={`group flex w-full items-center rounded text-sm transition-colors hover:bg-muted ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <button
          onClick={() => { onSelect(); onToggle?.() }}
          className="flex flex-1 min-w-0 items-center gap-1.5 py-1 text-left"
        >
          {children ? (
            isOpen
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : <span className="w-3.5" />}
          {isOpen
            ? <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
            : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="truncate">{name}</span>
        </button>
        {(onRename || onDelete) && (
          <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); onRename() }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted-foreground/20"
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive"
                title="Delete"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
      {isOpen && children && <div>{children}</div>}
    </div>
  )
}
