# Smart Dashboard Drilldown Row Rendering Report

## 1. Files modified

- `app/tools/smart-dashboard/page.tsx` — changed 6 lines in `DrilldownModal` row rendering: replaced the row primary fallback chain and added conditional filename subscript rendering.
- `docs/smart-dashboard-drilldown-row-rendering-report.md` — this report.

## 2. Row JSX diff

```diff
- const title = row?.vendor_name ?? row?.counterparty_name ?? row?.employer_name ?? file?.filename ?? "Untitled document"
+ const primary = row?.vendor_name ?? row?.counterparty_name ?? row?.employer_name ?? row?.expense_category ?? file?.filename ?? "Unlabeled"
+ const primaryIsField = !!(row?.vendor_name ?? row?.counterparty_name ?? row?.employer_name ?? row?.expense_category)
+ const subscriptFilename = primaryIsField ? file?.filename ?? null : null
```

```diff
  <div className="min-w-0">
-   <p className="truncate text-sm font-medium text-foreground">{title}</p>
+   <p className="truncate text-sm font-medium text-foreground">{primary}</p>
+   {subscriptFilename && (
+     <p className="mt-0.5 truncate text-xs text-muted-foreground">{subscriptFilename}</p>
+   )}
    <p className="mt-0.5 text-xs text-muted-foreground">{date} · {documentType}</p>
  </div>
```

The right amount/currency column and row wrapper classes remain unchanged.

## 3. Typecheck result

Passed:

```bash
npx tsc --noEmit --pretty false
```

## 4. Scope confirmation

- Only `app/tools/smart-dashboard/page.tsx` and this report file were changed for this edit.
- No schema changes.
- No `lib` changes.
- No edge function changes.
- No shared-component changes.
- No new queries.
- No state-changing git operations were performed.
