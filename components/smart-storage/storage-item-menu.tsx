"use client"

import type { ReactNode } from "react"
import { Download, FolderOutput, Pencil, Tag, X } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface StorageItemMenuProps {
  kind: "file" | "folder"
  filename: string
  isMultiSelect: boolean
  multiSelectCount: number
  canMoveUp?: boolean
  onRename: () => void
  onDelete: () => void | Promise<void>
  onDownload?: () => void | Promise<void>
  onDownloadSelection?: () => void | Promise<void>
  onDeleteSelection?: () => void | Promise<void>
  onMoveUp?: () => void | Promise<void>
  onReclassify?: () => void
  onContextIntent?: () => void
  children: ReactNode
}

export function StorageItemMenu({
  kind,
  filename,
  isMultiSelect,
  multiSelectCount,
  canMoveUp = false,
  onRename,
  onDelete,
  onDownload,
  onDownloadSelection,
  onDeleteSelection,
  onMoveUp,
  onReclassify,
  onContextIntent,
  children,
}: StorageItemMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenuCapture={() => onContextIntent?.()} className="block">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[196px] rounded-xl">
        {isMultiSelect ? (
          <>
            <ContextMenuLabel>{multiSelectCount} files selected</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem inset onSelect={() => void onDownloadSelection?.()}>
              <Download className="h-3.5 w-3.5" />
              Download all
              <ContextMenuShortcut>Enter</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem inset variant="destructive" onSelect={() => void onDeleteSelection?.()}>
              <X className="h-3.5 w-3.5" />
              Delete all selected
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : kind === "folder" ? (
          <>
            <ContextMenuLabel className="truncate">{filename}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem inset onSelect={() => void onRename()}>
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem inset variant="destructive" onSelect={() => void onDelete()}>
              <X className="h-3.5 w-3.5" />
              Delete folder
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuLabel className="truncate">{filename}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem inset onSelect={() => void onRename()}>
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </ContextMenuItem>
            {canMoveUp && onMoveUp && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem inset onSelect={() => void onMoveUp()}>
                  <FolderOutput className="h-3.5 w-3.5" />
                  Move up
                </ContextMenuItem>
              </>
            )}
            {onReclassify && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem inset onSelect={onReclassify}>
                  <Tag className="h-3.5 w-3.5" />
                  Reclassify
                </ContextMenuItem>
              </>
            )}
            {onDownload && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem inset onSelect={() => void onDownload()}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                  <ContextMenuShortcut>Enter</ContextMenuShortcut>
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem inset variant="destructive" onSelect={() => void onDelete()}>
              <X className="h-3.5 w-3.5" />
              Delete file
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
