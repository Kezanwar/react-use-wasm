interface BenchCardProps {
  /** e.g. "JavaScript" */
  label: string;
  /** e.g. "naive recursion, JIT compiled" */
  sub: string;
  ms: number | null;
  value: number | null;
  busy: boolean;
  /** Highlights whichever side came out faster on the last run. */
  faster: boolean;
  testId: string;
}

export function BenchCard({ label, sub, ms, value, busy, faster, testId }: BenchCardProps) {
  return (
    <div className={`bench${faster ? " bench-faster" : ""}`} data-testid={testId}>
      <div className="bench-label">{label}</div>
      <div className="bench-ms" data-testid={`${testId}-ms`}>
        {busy ? <span className="bench-pending">running…</span> : ms === null ? "—" : `${ms.toFixed(1)} ms`}
      </div>
      <div className="bench-value" data-testid={`${testId}-value`}>
        {value === null ? " " : value.toLocaleString()}
      </div>
      <div className="hint">{sub}</div>
    </div>
  );
}

/** Neutral one-liner comparing the two timings, in whichever direction. */
export function Verdict({ js, wasm, testId }: { js: number | null; wasm: number | null; testId: string }) {
  if (js === null || wasm === null) return null;
  const wasmWins = wasm < js;
  const ratio = wasmWins ? js / wasm : wasm / js;
  return (
    <p className="verdict" data-testid={testId}>
      {wasmWins ? "WebAssembly" : "JavaScript"} was{" "}
      <strong>{ratio.toFixed(2)}&times;</strong> faster on this run.
    </p>
  );
}
