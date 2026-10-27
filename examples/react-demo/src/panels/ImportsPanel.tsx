import { useState } from "react";
import { useWasm, useWasmWorker } from "react-use-wasm";
import { ArrowLeftRight } from "lucide-react";
import { Js } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asset } from "@/lib/asset";

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

  const main = useWasm<MathExports>(asset("math.wasm"), {
    imports: {
      env: { log: (x: number) => setMainLog((prev) => [...prev, x]) },
    },
  });

  const worker = useWasmWorker<MathExports>(asset("math.wasm"), {
    importsUrl: asset("wasm-imports.js"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="text-primary size-4" />
          Imports
        </CardTitle>
        <CardDescription>
          <Js /> functions cannot cross a worker boundary, so the worker hook takes a URL and the
          worker imports them itself.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!main.isReady}
            data-testid="imports-main-run"
            onClick={() => main.call("logSum", 40, 2)}
          >
            main thread: logSum(40, 2)
          </Button>
          <span className="text-muted-foreground tabular text-sm" data-testid="imports-main-log">
            <code>env.log</code> received: [{mainLog.join(", ")}]
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!worker.isReady}
            data-testid="imports-worker-run"
            onClick={async () => setWorkerResult(await worker.call("logSum", 1, 2))}
          >
            worker: logSum(1, 2)
          </Button>
          <span className="text-muted-foreground tabular text-sm" data-testid="imports-worker-result">
            returned: {workerResult ?? "—"}
          </span>
          <span className="text-muted-foreground text-xs">
            (<code>env.log</code> output is in the console)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
