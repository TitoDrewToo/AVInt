export type CollapsedBreadcrumbItem<T> = T | "ellipsis"

export function collapseBreadcrumb<T>(items: T[]): CollapsedBreadcrumbItem<T>[] {
  if (items.length <= 3) return items
  return [items[0], "ellipsis", ...items.slice(-2)]
}
