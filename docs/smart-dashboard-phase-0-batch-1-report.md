# Smart Dashboard Phase 0 Batch 1 Report

## 1. Files created

- `supabase/functions/_shared/widget-schemas.ts` — 127 lines. Shared Zod schemas for advanced widget output, R&D widget config, and bounded validation log payload sampling.
- `docs/smart-dashboard-phase-0-batch-1-report.md` — 65 lines. This report.

## 2. Files modified

- `app/tools/smart-dashboard/page.tsx` — added an in-memory `stillProcessingCount`, derived from already-loaded `files.upload_status` and `document_fields.normalization_status`; renders the amber "documents still processing" banner near the existing currency banner. `raw_json` remains selected.
- `supabase/functions/_shared/deps.ts` — added the centralized `zod@3.24.1` edge-function dependency export.
- `supabase/functions/generate-advanced-analytics/index.ts` — validates Haiku widget output before constructing insert rows; logs `widget_validation_failed` through `_shared/log.ts`; skips invalid widgets without defaulting.
- `supabase/functions/generate-rd-analytics/index.ts` — validates Sonnet R&D output before insert-row construction; validates constructed `rd-insight` config against `RdWidgetConfigSchema`; logs and skips invalid widgets.

## 3. Widget types enumerated in WidgetTypeSchema

Closed set from source:

- `line-chart`
- `area-chart`
- `bar-chart`
- `pie-chart`
- `stacked-bar`
- `composed-chart`
- `banded-area`
- `rd-insight`

## 4. Typecheck result

Passed:

```bash
npx tsc --noEmit --pretty false
```

The repo does not define an `npm run typecheck` script, so the local TypeScript compiler was used directly.

## 5. B1.1 deferral confirmation

B1.1 remains deferred per founder decision. `raw_json` was not removed from the dashboard `document_fields` SELECT, and `lib/smart-dashboard.ts` was not modified.

The dashboard SELECT received one additive field, `normalization_status`, for B1.3 so the still-processing banner can count raw/null field rows without adding a new query. The `raw_json` selection and `classifyRow` fallback remain intact.

## 6. Decisions made

- Haiku output was treated as `{ widgets: [{ widget_type, chart_family, title, description, insight }] }` based on `buildAdvancedAnalyticsSystemPrompt()` and the insert path in `generate-advanced-analytics`.
- Haiku `chart_family` is restricted to enabled family IDs from `lib/advanced-analytics-config.ts`.
- Sonnet output was treated as `{ widgets: [{ angle, chart_type, title, description, insight, data, x_key, data_key }] }` based on `RD_SYSTEM_PROMPT` and the `rd-insight` insert path.
- `rd-insight` is included in `WidgetTypeSchema` because it is the `widget_type` produced by `generate-rd-analytics`; it is not expected in raw Sonnet output.
- Zod was exported from `_shared/deps.ts` to match the edge-function dependency convention.

## 7. Blockers encountered

None after B1.1 was explicitly deferred.

## 8. Scope confirmation

- No migrations were created or modified.
- No schema changes, tables, materialized views, triggers, or stored functions were added.
- No `supabase/config.toml` edits were made.
- No Smart Storage report code was edited.
- `supabase/functions/generate-context-summary/` was not edited.
- `lib/smart-dashboard.ts` was not edited.
- No edge functions were deployed.
- No git operations were performed.
