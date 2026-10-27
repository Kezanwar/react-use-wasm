import { cn } from "cn";
import { Trophy } from "lucide-react";

interface BenchCardProps {
  label: string;
  sub: string;
  ms: number | null;
  value: number | null;
  busy: boolean;
  /** Highlights whichever side came out faster on the last run. */
  faster: boolean;
  tone: "js" | "wasm";
  testId: string;
}

export function BenchCard({ label, sub, ms, value, busy, faster, tone, testId }: BenchCardProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative rounded-xl border p-4 transition-colors",
        faster ? "shadow-sm" : "border-border bg-card",
        faster && tone === "js" && "border-js/60 bg-js-soft",
        faster && tone === "wasm" && "border-wasm/60 bg-wasm-soft"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn("size-2 rounded-full", tone === "js" ? "bg-js" : "bg-wasm")}
        />
        <span className="text-sm font-semibold">{label}</span>
        {faster && (
          <Trophy
            aria-label="faster"
            className={cn("ml-auto size-4", tone === "js" ? "text-js" : "text-wasm")}
          />
        )}
      </div>

      <div className="tabular mt-1 text-3xl font-bold" data-testid={`${testId}-ms`}>
        {busy ? (
          <span className="text-muted-foreground text-xl font-medium">running…</span>
        ) : ms === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {ms.toFixed(1)}
            <span className="text-muted-foreground ml-1 text-base font-medium">ms</span>
          </>
        )}
      </div>

      <div className="tabular text-muted-foreground text-sm" data-testid={`${testId}-value`}>
        {value === null ? " " : value.toLocaleString()}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">{sub}</p>
    </div>
  );
}

/** Neutral one-liner comparing the two timings, in whichever direction. */
export function Verdict({
  js,
  wasm,
  testId,
}: {
  js: number | null;
  wasm: number | null;
  testId: string;
}) {
  if (js === null || wasm === null) return null;
  const wasmWins = wasm < js;
  const ratio = wasmWins ? js / wasm : wasm / js;
  return (
    <p className="tabular mt-3 text-sm" data-testid={testId}>
      <span className={cn("font-semibold", wasmWins ? "text-wasm" : "text-js")}>
        {wasmWins ? "WebAssembly" : "JavaScript"}
      </span>{" "}
      was <strong>{ratio.toFixed(2)}&times;</strong> faster on this run.
    </p>
  );
}
