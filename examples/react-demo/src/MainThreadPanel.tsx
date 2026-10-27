import { useState } from "react";
import { useWasm } from "react-use-wasm";
import type { MathExports } from "./math-exports";
import { jsFib } from "./fib";
import { BenchCard, Verdict } from "./BenchCard";

/** Lets React paint before we hog the thread, so "running…" is actually seen. */
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

const WARMUP_N = 24;

/**
 * useWasm: the module runs on the main thread and `call` is synchronous.
 *
 * Both sides of this comparison block the page while they run, which is the
 * honest picture of the main-thread hook: wasm is faster, but it is not
 * non-blocking. Watch the frame counter in the header stall for both.
 */
export function MainThreadPanel() {
  const [n, setN] = useState(32);
  const [jsMs, setJsMs] = useState<number | null>(null);
  const [wasmMs, setWasmMs] = useState<number | null>(null);
  const [jsValue, setJsValue] = useState<number | null>(null);
  const [wasmValue, setWasmValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, error, call, reload } = useWasm<MathExports>("/math.wasm", {
    imports: {
      env: { log: (x: number) => console.log("[main] wasm logged:", x) },
    },
  });

  const run = async () => {
    setBusy(true);
    setJsMs(null);
    setWasmMs(null);
    setJsValue(null);
    setWasmValue(null);
    await nextPaint();

    // Warm both up first. An un-JITted first call to jsFib would lose by a
    // mile and the comparison would be meaningless.
    jsFib(WARMUP_N);
    call("fib", WARMUP_N);

    const t0 = performance.now();
    const jsResult = jsFib(n);
    const jsElapsed = performance.now() - t0;

    const t1 = performance.now();
    const wasmResult = call("fib", n);
    const wasmElapsed = performance.now() - t1;

    setJsValue(jsResult);
    setJsMs(jsElapsed);
    setWasmValue(wasmResult);
    setWasmMs(wasmElapsed);
    setBusy(false);
  };

  if (status === "idle" || status === "loading") {
    return (
      <section>
        <h2>
          <code>useWasm</code> — main thread
        </h2>
        <p>Loading wasm…</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section>
        <h2>
          <code>useWasm</code> — main thread
        </h2>
        <p className="error">
          Failed: {error.message} <button onClick={reload}>Retry</button>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>
        <code>useWasm</code> — main thread
      </h2>
      <p>
        <code>call</code> is synchronous, so results can be used straight in a
        render body: <code>add(2, 3)</code> ={" "}
        <strong data-testid="add-result">{call("add", 2, 3)}</strong>,{" "}
        <code>scale(2.5, 4)</code> ={" "}
        <strong data-testid="scale-result">{call("scale", 2.5, 4)}</strong>.
      </p>

      <div className="row">
        <label>
          fib(n), n ={" "}
          <input
            type="number"
            value={n}
            min={0}
            max={42}
            data-testid="main-n"
            onChange={(e) => setN(Number(e.target.value))}
          />
        </label>
        <button onClick={run} disabled={busy} data-testid="main-run">
          Run both
        </button>
        {busy && <span data-testid="main-busy">Computing… (the page is frozen)</span>}
      </div>

      <div className="bench-grid">
        <BenchCard
          label="JavaScript"
          sub="naive recursion, JIT compiled"
          ms={jsMs}
          value={jsValue}
          busy={busy}
          faster={jsMs !== null && wasmMs !== null && jsMs < wasmMs}
          testId="main-js"
        />
        <BenchCard
          label="WebAssembly"
          sub="same algorithm, TinyGo"
          ms={wasmMs}
          value={wasmValue}
          busy={busy}
          faster={jsMs !== null && wasmMs !== null && wasmMs < jsMs}
          testId="main-wasm"
        />
      </div>

      <Verdict js={jsMs} wasm={wasmMs} testId="main-verdict" />

      <p className="hint">
        Both run on the main thread, one after the other, each warmed up at n ={" "}
        {WARMUP_N} first. Push n past 35 and watch the frame counter above stop
        dead for both: faster is not the same as non-blocking.
      </p>
    </section>
  );
}
