import { useState } from "react";
import { useWasmWorker } from "react-use-wasm";
import { Cpu, Play, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/NumberInput";
import { asset } from "@/lib/asset";

const SNIPPET = `const { status, call, terminate } = useWasmWorker<MathExports>("/math.wasm", {
  // Functions can't be posted to a worker, so imports arrive by URL.
  importsUrl: "/wasm-imports.js",
});

// Numbers and bigints cross fine. call returns a Promise, and the
// main thread keeps painting the whole time.
const value = await call("fib", 32);   // Promise<number>

// ---------------------------------------------------------------
// Anything bigger does not. There is no exports.memory on this side:
// the module lives in the worker, and a WebAssembly.Memory is not
// structured-cloneable, so it never comes back. Neither of these
// works today:
//
//   withScope(...)             <- useWasm only
//   call("sumInt32", xs)       <- xs arrives as NaN, not an array
//
// Until the hook marshals for you, the workaround is your own worker
// via the workerUrl option, doing the alloc/write/read inside it.`;

export function WorkerLimitsExample() {
  const [n, setN] = useState<number | null>(32);
  const [value, setValue] = useState<number | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, error, call, reload } = useWasmWorker<MathExports>(asset("math.wasm"), {
    importsUrl: asset("wasm-imports.js"),
  });

  const run = async () => {
    if (n === null) return;
    setBusy(true);
    try {
      const t0 = performance.now();
      const result = await call("fib", n);
      setMs(performance.now() - t0);
      setValue(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="text-primary size-4" />
          useWasmWorker
          <Badge variant="secondary">numbers only</Badge>
        </CardTitle>
        <CardDescription>
          Everything above used <code>useWasm</code>, where <Js /> and <Wasm>wasm</Wasm> share one{" "}
          <code>ArrayBuffer</code>. Move the module into a worker and that stops being true.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          A <code>WebAssembly.Memory</code> is not structured-cloneable, so the worker hook never
          hands one back. <code>call</code> works perfectly for arguments and results that are{" "}
          <strong className="text-foreground">numbers or bigints</strong>, and there is no way to
          read or write the module's memory from this thread at all.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <code className="mr-1">fib(n)</code> n =
            </span>
            <NumberInput
              value={n}
              onChange={setN}
              min={1}
              max={42}
              testId="worker-limits-n"
              label="n for the worker example"
            />
          </div>
          <Button
            onClick={run}
            disabled={status !== "ready" || busy || n === null}
            data-testid="worker-limits-run"
          >
            <Play className="size-4" /> Run in the worker
          </Button>
          {busy && <span className="text-muted-foreground text-sm">computing off-thread…</span>}
          {status === "loading" && (
            <span className="text-muted-foreground text-sm">starting worker…</span>
          )}
        </div>

        {status === "error" && (
          <p className="text-destructive flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4" /> {error.message}
            <Button variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </p>
        )}

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">result</dt>
            <dd className="tabular font-mono font-semibold" data-testid="worker-limits-value">
              {value === null ? "—" : value.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">took</dt>
            <dd className="tabular font-mono font-semibold" data-testid="worker-limits-ms">
              {ms === null ? "—" : `${ms.toFixed(1)} ms`}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground text-sm">
          One number in, one number out, so nothing here needs linear memory. Push n to 40 and the
          page still scrolls, which is the whole reason the hook exists. The{" "}
          <strong className="text-foreground">Benchmarks</strong> tab races this against the same
          algorithm in a plain <Js /> worker.
        </p>

        <CodeBlock code={SNIPPET} label="TypeScript" />
      </CardContent>
    </Card>
  );
}
