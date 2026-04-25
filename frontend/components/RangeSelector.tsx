"use client";

import { cn } from "@/lib/utils";
import type { Range } from "@/lib/api";

const RANGES: Range[] = ["1m", "3m", "6m", "1y"];

interface RangeSelectorProps {
  value: Range;
  onChange: (r: Range) => void;
  disabled?: boolean;
}

export function RangeSelector({ value, onChange, disabled }: RangeSelectorProps) {
  return (
    <div className="flex gap-0.5 rounded-md border border-border bg-muted p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r)}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-40",
            value === r
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
