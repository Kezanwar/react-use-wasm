import { useState } from "react";
import { useWasmWorker } from "react-use-wasm";
import { Layers, Play, TriangleAlert, X } from "lucide-react";
import type { MathExports } from "@/math-exports";
import { useJsWorker } from "@/useJsWorker";
import { BenchCard, Verdict } from "@/components/BenchCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const WARMUP_N = 24;

/**
 * useWasmWorker: the module lives in a Web Worker, so `call` returns a
 * Promise and the main thread stays free.
 *
 * Both sides here run in a worker. The only difference being measured is the
 * language, not the threading, which is the fair comparison: the frame
 * counter in the header keeps climbing for both.
 */
export function WorkerPanel() {
  const [n, setN] = useState(40);
  const [jsMs, setJsMs] = useState<number | null>(null);
  const [wasmMs, setWasmMs] = useState<number | null>(null);
  const [jsValue, setJsValue] = useState<number | null>(null);
  const [wasmValue, setWasmValue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const wasm = useWasmWorker<MathExports>("/math.wasm", {
    importsUrl: "/wasm-imports.js",
  });
  const js = useJsWorker("/js-fib-worker.js");

  const ready = wasm.status === "ready" && js.isReady;

  const run = async () => {
    setBusy(true);
    setNote(null);
    setJsMs(null);
    setWasmMs(null);
    setJsValue(null);
    setWasmValue(null);

    try {
      // Warm each worker up, same as the main-thread panel.
      await js.call(WARMUP_N);
      await wasm.call("fib", WARMUP_N);

      // Sequentially, so the two are not competing for cores.
      const t0 = performance.now();
      const jsResult = await js.call(n);
      const jsElapsed = performance.now() - t0;
      setJsValue(jsResult);
      setJsMs(jsElapsed);

      const t1 = performance.now();
      const wasmResult = await wasm.call("fib", n);
      const wasmElapsed = performance.now() - t1;
      setWasmValue(wasmResult);
      setWasmMs(wasmElapsed);
    } catch (err) {
      // Cancelling rejects whichever call was in flight, landing here.
      setNote(err instanceof Error ? `cancelled: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  // A running call cannot be interrupted. Cancelling means killing both
  // workers and starting fresh ones.
  const cancel = () => {
    js.terminate();
    wasm.terminate();
    js.reload();
    wasm.reload();
  };

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Layers className="text-primary size-4" />
        <code className="font-mono text-base">useWasmWorker</code>
        <Badge variant="secondary">Web Worker</Badge>
      </CardTitle>
      <CardDescription>
        <code className="font-mono">call</code> returns a Promise and the work happens off the main
        thread, so the page stays interactive throughout.
      </CardDescription>
    </CardHeader>
  );

  if (wasm.status === "error") {
    return (
      <Card>
        {header}
        <CardContent className="space-y-3">
          <p className="text-destructive flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4" /> {wasm.error.message}
          </p>
          <Button variant="outline" size="sm" onClick={wasm.reload}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <code className="font-mono">fib(n)</code>, n =
            </span>
            <Input
              type="number"
              value={n}
              min={0}
              max={45}
              data-testid="worker-n"
              onChange={(e) => setN(Number(e.target.value))}
              className="tabular w-24"
            />
          </label>
          <Button onClick={run} disabled={!ready || busy} data-testid="worker-run">
            <Play className="size-4" /> {ready ? "Run both" : "Loading workers…"}
          </Button>
          {busy && (
            <Button variant="destructive" onClick={cancel} data-testid="worker-cancel">
              <X className="size-4" /> Cancel
            </Button>
          )}
          {busy && (
            <span className="text-muted-foreground text-sm" data-testid="worker-busy">
              Computing… (the page stays responsive)
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BenchCard
            label="JavaScript worker"
            sub="plain JS module worker"
            tone="js"
            ms={jsMs}
            value={jsValue}
            busy={busy && jsMs === null}
            faster={jsMs !== null && wasmMs !== null && jsMs < wasmMs}
            testId="worker-js"
          />
          <BenchCard
            label="Wasm worker"
            sub="useWasmWorker, TinyGo module"
            tone="wasm"
            ms={wasmMs}
            value={wasmValue}
            busy={busy && jsMs !== null && wasmMs === null}
            faster={jsMs !== null && wasmMs !== null && wasmMs < jsMs}
            testId="worker-wasm"
          />
        </div>

        <Verdict js={jsMs} wasm={wasmMs} testId="worker-verdict" />

        {note && (
          <p className="text-destructive text-sm" data-testid="worker-note">
            {note}
          </p>
        )}

        <p className="text-muted-foreground text-xs">
          Timings are wall clock from the main thread, so they include the postMessage round trip
          (well under a millisecond at these sizes). Try n = 42, then hit Cancel halfway.
        </p>
      </CardContent>
    </Card>
  );
}
