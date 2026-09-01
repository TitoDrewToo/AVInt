"use client"

import { useRef, type ReactNode } from "react"
import { Download, FolderOutput, Pencil, RefreshCw, Tag, X } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Tip } from "@/components/ui/tip"

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
  onReprocess?: () => void | Promise<void>
  onContextIntent?: () => void
  disableTouchContextMenu?: boolean
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
  onReprocess,
  onContextIntent,
  disableTouchContextMenu = false,
  children,
}: StorageItemMenuProps) {
  const touchContextMenuBlockedUntilRef = useRef(0)

  return (
    <ContextMenu>
      <ContextMenuTrigger
        onPointerDownCapture={(event) => {
          if (disableTouchContextMenu && event.pointerType === "touch") {
            touchContextMenuBlockedUntilRef.current = Date.now() + 1200
          }
        }}
        onContextMenuCapture={(event) => {
          if (disableTouchContextMenu && Date.now() < touchContextMenuBlockedUntilRef.current) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onContextIntent?.()
        }}
        className="block"
      >
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
            <Tip text="Rename this document."><ContextMenuItem inset onSelect={() => void onRename()}><Pencil className="h-3.5 w-3.5" />Rename</ContextMenuItem></Tip>
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
                <Tip text="Move this file to the parent folder."><ContextMenuItem inset onSelect={() => void onMoveUp()}><FolderOutput className="h-3.5 w-3.5" />Move up</ContextMenuItem></Tip>
              </>
            )}
            {onReclassify && (
              <>
                <ContextMenuSeparator />
                <Tip text="Edit extracted fields and apply AI suggestions">
                  <ContextMenuItem inset onSelect={onReclassify}>
                    <Tag className="h-3.5 w-3.5" />
                    Reclassify
                  </ContextMenuItem>
                </Tip>
              </>
            )}
            {onReprocess && (
              <>
                <ContextMenuSeparator />
                <Tip text="Re-read this document while preserving your corrections.">
                  <ContextMenuItem inset onSelect={() => void onReprocess()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reprocess
                  </ContextMenuItem>
                </Tip>
              </>
            )}
            {onDownload && (
              <>
                <ContextMenuSeparator />
                <Tip text="Download the original file(s)."><ContextMenuItem inset onSelect={() => void onDownload()}><Download className="h-3.5 w-3.5" />Download<ContextMenuShortcut>Enter</ContextMenuShortcut></ContextMenuItem></Tip>
              </>
            )}
            <ContextMenuSeparator />
            <Tip text="Delete permanently. This can't be undone."><ContextMenuItem inset variant="destructive" onSelect={() => void onDelete()}><X className="h-3.5 w-3.5" />Delete file<ContextMenuShortcut>Del</ContextMenuShortcut></ContextMenuItem></Tip>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
