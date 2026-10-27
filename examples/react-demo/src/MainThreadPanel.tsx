import { useState } from "react";
import { useWasm } from "react-use-wasm";
import type { MathExports } from "./math-exports";

/**
 * useWasm: the module runs on the main thread and `call` is synchronous, so
 * results can be computed straight in the render body.
 *
 * Keep the work small here. fib(40) would freeze the page for about half a
 * second; that is what the worker panel is for.
 */
export function MainThreadPanel() {
  const [n, setN] = useState(25);

  const { status, error, call, reload } = useWasm<MathExports>("/math.wasm", {
    imports: {
      env: { log: (x: number) => console.log("[main] wasm logged:", x) },
    },
  });

  if (status === "idle" || status === "loading") {
    return (
      <section>
        <h2>useWasm (main thread)</h2>
        <p>Loading wasm…</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section>
        <h2>useWasm (main thread)</h2>
        <p className="error">
          Failed: {error.message} <button onClick={reload}>Retry</button>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>useWasm (main thread)</h2>
      <p>
        Synchronous <code>call</code>, computed during render.
      </p>

      <p data-testid="add-result">
        <code>add(2, 3)</code> = <strong>{call("add", 2, 3)}</strong>
      </p>
      <p data-testid="scale-result">
        <code>scale(2.5, 4)</code> = <strong>{call("scale", 2.5, 4)}</strong>
      </p>

      <label>
        n:{" "}
        <input
          type="number"
          value={n}
          min={0}
          max={32}
          data-testid="main-n"
          onChange={(e) => setN(Number(e.target.value))}
        />
      </label>
      <p data-testid="main-fib-result">
        <code>
          fib({n})
        </code>{" "}
        = <strong>{call("fib", n)}</strong>
      </p>
      <p className="hint">
        Push n past 35 and watch the frame counter above stop dead. That is
        the main thread blocking.
      </p>
    </section>
  );
}
