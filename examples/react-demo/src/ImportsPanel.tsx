import { useState } from "react";
import { useWasm, useWasmWorker } from "react-use-wasm";
import type { MathExports } from "./math-exports";

/**
 * Both ways of supplying the wasm module's imports.
 *
 * Main thread: `imports`, an ordinary object with real functions in it.
 * Worker: `importsUrl`, because functions cannot be cloned across a worker
 * boundary. The worker dynamically imports that URL itself.
 *
 * `logSum(a, b)` calls the host's `env.log` with the sum, then returns it.
 */
export function ImportsPanel() {
  const [mainLog, setMainLog] = useState<number[]>([]);
  const [workerResult, setWorkerResult] = useState<number | null>(null);

  const main = useWasm<MathExports>("/math.wasm", {
    imports: {
      env: { log: (x: number) => setMainLog((prev) => [...prev, x]) },
    },
  });

  const worker = useWasmWorker<MathExports>("/math.wasm", {
    importsUrl: "/wasm-imports.js",
  });

  return (
    <section>
      <h2>Imports</h2>

      <p>
        <button
          disabled={!main.isReady}
          data-testid="imports-main-run"
          onClick={() => main.call("logSum", 40, 2)}
        >
          main thread: logSum(40, 2)
        </button>{" "}
        <span data-testid="imports-main-log">
          env.log received: [{mainLog.join(", ")}]
        </span>
      </p>

      <p>
        <button
          disabled={!worker.isReady}
          data-testid="imports-worker-run"
          onClick={async () => setWorkerResult(await worker.call("logSum", 1, 2))}
        >
          worker: logSum(1, 2)
        </button>{" "}
        <span data-testid="imports-worker-result">
          returned: {workerResult ?? "—"}
        </span>
        <span className="hint"> (env.log output is in the console)</span>
      </p>
    </section>
  );
}
