export default function SmartStorageLoading() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full px-4 pt-4">
        <nav className="glass-surface mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-5 py-3">
          <div className="h-8 w-44 animate-pulse rounded bg-muted" />
          <div className="hidden items-center gap-4 md:flex">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
          </div>
          <div className="h-9 w-9 animate-pulse rounded-lg bg-muted md:hidden" />
        </nav>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-7 w-44 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-36 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="grid min-h-[60vh] grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)_260px]">
          <div className="hidden rounded-lg border border-border/60 bg-muted/20 md:block" />
          <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
            <div className="mb-4 h-9 w-full animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="aspect-[0.86] animate-pulse rounded-lg bg-muted/80" />
              ))}
            </div>
          </div>
          <div className="hidden rounded-lg border border-border/60 bg-muted/20 lg:block" />
        </div>
      </main>
    </div>
  )
}
