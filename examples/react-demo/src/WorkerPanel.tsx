import { useState } from "react";
import { useWasmWorker } from "react-use-wasm";
import type { MathExports } from "./math-exports";

type Heavy = "fib" | "countPrimes";

/**
 * useWasmWorker: the module lives in a Web Worker, so `call` returns a
 * Promise and the heavy work never touches the main thread. The frame
 * counter in the header keeps climbing throughout.
 */
export function WorkerPanel() {
  const [fn, setFn] = useState<Heavy>("fib");
  const [n, setN] = useState(40);
  const [result, setResult] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, error, call, reload, terminate } = useWasmWorker<MathExports>("/math.wasm", {
    importsUrl: "/wasm-imports.js",
  });

  const run = async () => {
    setBusy(true);
    setResult(null);
    setElapsed(null);
    const started = performance.now();
    try {
      const value = await call(fn, n);
      setResult(String(value));
      setElapsed(Math.round(performance.now() - started));
    } catch (err) {
      // Cancelling rejects the pending call, which lands here.
      setResult(err instanceof Error ? `cancelled: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  // Cancelling means killing the worker mid-call, then starting a fresh one.
  // There is no other way to interrupt a running wasm function.
  const cancel = () => {
    terminate();
    reload();
  };

  if (status === "error") {
    return (
      <section>
        <h2>useWasmWorker (Web Worker)</h2>
        <p className="error">
          Failed: {error.message} <button onClick={reload}>Retry</button>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>useWasmWorker (Web Worker)</h2>
      <p>
        Async <code>call</code>. The page stays interactive while this runs.
      </p>

      <div className="row">
        <label>
          function:{" "}
          <select
            value={fn}
            data-testid="worker-fn"
            onChange={(e) => setFn(e.target.value as Heavy)}
          >
            <option value="fib">fib</option>
            <option value="countPrimes">countPrimes</option>
          </select>
        </label>
        <label>
          n:{" "}
          <input
            type="number"
            value={n}
            data-testid="worker-n"
            onChange={(e) => setN(Number(e.target.value))}
          />
        </label>
        <button onClick={run} disabled={status !== "ready" || busy} data-testid="worker-run">
          {status === "ready" ? "Compute" : "Loading wasm…"}
        </button>
        {busy && (
          <button onClick={cancel} data-testid="worker-cancel">
            Cancel
          </button>
        )}
      </div>

      {busy && <p data-testid="worker-busy">Computing… (the page stays responsive)</p>}

      {result !== null && (
        <p data-testid="worker-result">
          <code>
            {fn}({n})
          </code>{" "}
          = <strong>{result}</strong>
          {elapsed !== null && <span className="hint"> ({elapsed} ms in the worker)</span>}
        </p>
      )}

      <p className="hint">
        Try fib(40), or countPrimes(5000000). Compare with the main-thread
        panel at the same n.
      </p>
    </section>
  );
}
