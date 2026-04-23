"use client"

import { Input } from "@/components/ui/input"
import { getPresetRange, type DateRange, type DateRangePreset } from "@/lib/smart-storage"

interface DateRangeSelectorProps {
  dateRange: DateRange
  onChange: (range: DateRange) => void
}

export function DateRangeSelector({ dateRange, onChange }: DateRangeSelectorProps) {
  const presets: { label: string; value: DateRangePreset }[] = [
    { label: "Last month", value: "last_month" },
    { label: "This year", value: "this_year" },
    { label: "Prev year", value: "prev_year" },
    { label: "Custom", value: "custom" },
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => {
              const range = getPresetRange(preset.value)
              onChange({ preset: preset.value, ...range })
            }}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              dateRange.preset === preset.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {dateRange.preset === "custom" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => onChange({ ...dateRange, from: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => onChange({ ...dateRange, to: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}
