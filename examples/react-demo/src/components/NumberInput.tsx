import { Minus, Plus } from "lucide-react";
import { cn } from "cn";

/**
 * The n input every panel uses, with steppers.
 *
 * `null` is a real state, not zero. A plain `type="number"` coerces an empty
 * field to 0, which on a phone means clearing it to type a new value
 * immediately runs fib(0). Callers disable their Run button while it is null
 * instead.
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  testId,
  label,
  className,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  testId?: string;
  label: string;
  className?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  // From blank, either button lands on min: there is nothing to step from.
  const nudge = (by: number) => onChange(value === null ? min : clamp(value + by));

  const button =
    "text-muted-foreground hover:text-foreground hover:bg-accent flex h-full w-8 shrink-0 " +
    "items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className={cn(
        "border-input bg-background focus-within:border-ring focus-within:ring-ring/50 inline-flex h-9",
        "items-center overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow]",
        "focus-within:ring-[3px] dark:bg-input/30",
        className
      )}
    >
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={value !== null && value <= min}
        aria-label={`Decrease ${label}`}
        className={cn(button, "border-input border-r")}
      >
        <Minus className="size-3.5" />
      </button>

      <input
        // Deliberately text, not number: it keeps the browser's own spinners
        // off and lets the field be genuinely empty.
        type="text"
        inputMode="numeric"
        value={value === null ? "" : String(value)}
        onChange={(ev) => {
          const raw = ev.target.value.trim();
          if (raw === "") return onChange(null);
          const parsed = Number(raw);
          // No clamping while typing: on a max of 42, typing "4" towards
          // "40" would stick at 42 and the second keystroke would be lost.
          if (Number.isInteger(parsed) && parsed >= 0) onChange(parsed);
        }}
        onBlur={() => {
          if (value !== null) onChange(clamp(value));
        }}
        data-testid={testId}
        aria-label={label}
        className="tabular w-12 min-w-0 flex-1 bg-transparent text-center text-base outline-none md:text-sm"
      />

      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={value !== null && value >= max}
        aria-label={`Increase ${label}`}
        className={cn(button, "border-input border-l")}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
