# avint — Tools Hover-Hint Copy

Authored hint strings for the three tool surfaces (Smart Storage, the Reports generator, Smart Dashboard). Keep tooltips short, plain-English, and benefit-led — say what the control does *for the user*, not the mechanism.

## Wiring conventions (for the implementer)
- Reuse the existing `Tip` wrapper pattern already in `app/tools/smart-storage/page.tsx` and `components/smart-storage/storage-item-menu.tsx` (`Tooltip` / `TooltipTrigger` / `TooltipContent` from `components/ui/tooltip.tsx`, `delayDuration={500}`, `sideOffset={6}`). Lift a shared `Tip` into a small component if it's now used in 3+ files.
- Icon-only controls must **also** get an `aria-label` (accessibility), not just a tooltip.
- Do **not** re-wrap controls that already have a hint — those are marked **[exists — keep]** below. Only add where missing.
- `TooltipProvider` must wrap each tool page once (Smart Dashboard/Reports may not have one yet — add at the page root).
- No behavior changes; copy only.

---

## 1. Smart Storage — `app/tools/smart-storage/page.tsx` (+ components)

### Top toolbar
| Control | Hint |
|---|---|
| Upload (dropdown trigger) | Add receipts, invoices, payslips, or contracts — we scan each file, then auto-extract the key fields. |
| ↳ "Upload files" item | Pick individual files — PDF, images, XLSX or CSV, up to 60 MB each. |
| ↳ "Upload folder" item | Import a whole folder; its subfolders are recreated here. |
| Manual entry (`PenLine`) | Enter a document by hand when you don't have a file to upload. |
| New folder (`Plus`) | Create a folder to organize documents your way. |
| Delete selected (`X`/trash) | Delete the selected documents. This can't be undone. |
| Back (`ArrowLeft`) | Go up to the parent folder. |
| List view (`aria-label="List view"`) | Show documents as a detailed list. |
| Grid view (`aria-label="Grid view"`) | Show documents as icons you can arrange. |
| Load more (`Button`, ~L2489) | Load older documents. |
| Retry badge | **[exists — keep]** "Click to retry processing" |
| Processing badge | **[exists — keep]** "Files being processed - usually completes in 1-3 minutes" |

### Left navigation rail
| Control | Hint |
|---|---|
| Documents (root) | Everything you've uploaded, in folders. |
| Manual Entries | Documents you added by hand. |
| Classification group (auto, e.g. "Receipts") | Auto-grouped by type. Files show here without leaving their folder. |
| Unclassified view | Documents we couldn't confidently type yet — open one to set its type. |

### File tile / context menu — `components/smart-storage/storage-item-menu.tsx`
| Control | Hint |
|---|---|
| Select checkbox | Select for bulk actions like download or delete. |
| Rename | Rename this document. |
| Reclassify | **[exists — keep]** "Edit extracted fields and apply AI suggestions" |
| Reclassify sheet (XLSX/CSV) | Fix the column mapping and per-row fields for this spreadsheet. |
| Move up | Move this file to the parent folder. |
| Download / Download all | Download the original file(s). |
| Delete file / folder | Delete permanently. This can't be undone. |

### Reports rail (right side of Smart Storage)
| Control | Hint |
|---|---|
| Date-range toggle (`showDateRange`) | Limit reports to a date range. Defaults to your most active tax year. |
| Tax Bundle — Schedule C | For self-employed / 1099 income — maps expenses to IRS Schedule C. |
| Tax Bundle — Employed | For W-2 wage earners — organizes payslips and withholdings. |
| Business Expense | Itemized, categorized expense report for review or filing. |
| Expense Summary | Totals by category over the selected period. |
| Income Summary | Income totals and sources over the selected period. |
| Profit & Loss | Income minus expenses for the period. |
| Contract Summary | Key parties, dates, and obligations pulled from contracts. |
| Key Terms | The important clauses and terms extracted from a document. |
| Locked (Free plan) | **[exists — keep]** "Upgrade to Pro to generate reports" |

---

## 2. Reports generator — shared across `app/tools/smart-storage/reports/**/page.tsx`

These controls repeat across report pages (tax-bundle, business-expense, expense/income summary, P&L, contract, key-terms). Wire once via a shared header component if practical.

| Control | Hint |
|---|---|
| Back (`ArrowLeft`) | Return to Smart Storage. |
| Tax-year preset buttons | Jump to a tax year detected in your documents. |
| Custom date From/To | Set an exact reporting period. |
| Folder filter (`<select>`, `FolderOpen`) | Limit this report to one folder and its subfolders. |
| Clear folder filter (`aria-label="Clear folder filter"`) | Clear the filter — include all documents. |
| Export CSV | Download the summary as a CSV. |
| QuickBooks CSV | Export for QuickBooks (Date, Description, Amount; expenses negative). |
| Xero CSV | Export for Xero (Date, Amount, Payee, Description). |
| Print / PDF (`Printer`) | Open your browser's print dialog to save as PDF. |
| Download Zip (tax-bundle) | Full evidence bundle — summary CSV, source files, and a manifest. |
| Regenerate (`RefreshCw`, contract/key-terms) | Re-run AI extraction for this document. |
| Save / Archive (tax-bundle) | Save this bundle snapshot to revisit later. |

**Free-tier note:** QuickBooks/Xero buttons render as "QuickBooks (upgrade)" / "Xero (upgrade)" on Free. On those, use the hint: "CSV exports for QuickBooks/Xero are a Pro feature."

---

## 3. Smart Dashboard — `app/tools/smart-dashboard/page.tsx`

Several **per-widget** controls already carry `title=` tooltips — keep them and don't double-wrap. Gaps are mostly toolbar-level.

### Toolbar
| Control | Hint |
|---|---|
| Edit Layout (`LayoutGrid`) | Rearrange and resize widgets — drag to move, corners to resize. |
| Save Layout (`Save`) | Save your current widget arrangement. |
| "Saved" confirm state | No hint needed. |
| Period selector (`Calendar`) | Choose the time period the dashboard covers. |
| Accent swatches (`CURATED_ACCENTS`) | Recolor the whole dashboard. |
| Add widgets panel trigger | Add KPIs and charts to your dashboard. |
| Advanced Analytics / Generate visualizations | Let AI build new charts from your data. Pro feature. |
| Advanced Analytics locked | **[exists — keep]** "Upgrade to Pro to unlock Advanced Analytics" |
| Context Summary generate | AI writes a plain-English read on what your numbers show. Pro feature. |
| Context Summary locked | **[exists — keep]** "Upgrade to Pro to unlock Context Summary" |

### Per-widget
| Control | Hint |
|---|---|
| Time-grain cycle | **[exists — keep]** "Cycle monthly, weekly, and daily view" |
| Currency primary selector | **[exists — keep]** "Choose which native currency appears first. Amounts are not converted." |
| Currency tab | **[exists — keep]** "Show {currency} amounts without conversion" |
| Drillable chart (bar/slice) | Click a bar or slice to drill into its transactions. |
| Close drilldown (`aria-label="Close drilldown"`) | Close and return to the full chart. |
| Remove widget (edit mode `X`) | Remove this widget from the dashboard. |
| Chart-type options | Switch this widget between chart styles. |

---

## Copy principles used
- Lead with the outcome ("Download the summary as CSV"), not the widget name.
- Name the audience where it disambiguates (Schedule C = self-employed; Employed = W-2).
- Always flag irreversibility ("This can't be undone") and Pro-gating ("Pro feature").
- One sentence, ~10 words, no period-stacking. Sentence case.
