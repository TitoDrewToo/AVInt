# Smart Dashboard R&D Chart Switcher Report

## 1. Files modified

- `app/tools/smart-dashboard/page.tsx` — added 9 lines: 8-line `variantToChartType` helper and 1-line `effectiveChartType` derivation in the R&D renderer. Existing R&D branch comparisons were changed to read `effectiveChartType`.
- `docs/smart-dashboard-rd-chart-switcher-report.md` — this report.

## 2. Diff snippet

```diff
+function variantToChartType(variant: string | null | undefined): RdWidgetConfig["chart_type"] | undefined {
+  if (variant === "pie") return "pie-chart"
+  if (variant === "bar") return "bar-chart"
+  if (variant === "line") return "line-chart"
+  if (variant === "area") return "area-chart"
+  return undefined
+}
+
 function currencyHasWidgetData(bucket: DashboardCurrencyBucket | undefined, widgetType: string) {
```

```diff
   if (widget.rdConfig) {
     const rd = widget.rdConfig
+    const effectiveChartType = variantToChartType(widget.chartVariant) ?? rd.chart_type
     const rdSymbol = currencyToSymbol(rd.currency)
```

```diff
-            {rd.chart_type === "line-chart" ? (
+            {effectiveChartType === "line-chart" ? (
...
-            ) : rd.chart_type === "area-chart" ? (
+            ) : effectiveChartType === "area-chart" ? (
...
-            ) : rd.chart_type === "pie-chart" ? (
+            ) : effectiveChartType === "pie-chart" ? (
```

The final fallback branch remains the existing bar renderer, so undefined `widget.chartVariant` preserves current behavior through `rd.chart_type`.

## 3. Typecheck result

Passed:

```bash
npx tsc --noEmit --pretty false
```

## 4. Haiku rendering confirmation

The standard Haiku/spec widget render paths were not modified:

- `widget.type === "area-chart"` remains unchanged.
- `widget.type === "bar-chart" || widget.type === "bar-deductible"` remains unchanged.
- `widget.type === "pie-chart"` remains unchanged.

## 5. Type contract confirmation

`lib/smart-dashboard.ts` was not modified. `Widget.chartVariant` remains an optional string, and `RdWidgetConfig.chart_type` remains the Sonnet-baked chart type union.

## 6. Decisions made

- Placed `variantToChartType` as a small private helper above the component so it is shared by the R&D renderer without changing component signatures.
- Used `widget.chartVariant` as override-of-record and fell back to `rd.chart_type` for existing layouts with no persisted override.
- Did not widen chart options or add runtime validation; `CHART_TYPE_OPTIONS` remains the switcher contract.

## 7. Scope confirmation

- No schema files changed.
- No migrations changed.
- No edge functions changed.
- No Smart Storage report code changed.
- No files outside `app/tools/smart-dashboard/page.tsx` and this report were edited for this batch.
- No git init, commit, push, merge, or other state-changing git operations were performed.

Note: unrelated pre-existing worktree entries remain present and were not touched by this batch.
