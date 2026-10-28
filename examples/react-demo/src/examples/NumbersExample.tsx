import { useState } from "react";
import { useWasm, useWasmWorker } from "react-use-wasm";
import { Play, Sigma, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { CodeTabs } from "@/components/CodeBlock";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { asset } from "@/lib/asset";

const MAIN = `const { isReady, exports, call } = useWasm<MathExports>("/math.wasm", {
  imports: { env: { log: console.log } },
});

if (!isReady) return <p>Loading…</p>;

// Synchronous. exports is narrowed to MathExports by the guard above,
// so this is fully typed and could go straight in the render body.
const sum = exports.add(a, b);
const scaled = call("scale", a, b);`;

const WORKER = `const { isReady, call } = useWasmWorker<MathExports>("/math.wasm", {
  // Functions can't be posted to a worker, so imports arrive by URL.
  importsUrl: "/wasm-imports.js",
});

// Same call, same types, now a Promise. There is no exports here:
// the instance lives in the worker.
const sum = await call("add", a, b);
const scaled = await call("scale", a, b);`;

/**
 * The baseline: numbers in, numbers out, no allocator and no memory.
 *
 * Deliberately first on the page, and deliberately running both hooks.
 * Everything below it is about getting larger values across, which is easy
 * to mistake for a requirement rather than the opt-in extra it is.
 */
export function NumbersExample() {
  const [a, setA] = useState<number | null>(2);
  const [b, setB] = useState<number | null>(3);
  const [main, setMain] = useState<{ sum: number; scaled: number } | null>(null);
  const [worker, setWorker] = useState<{ sum: number; scaled: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // math.wasm calls back into the host through env.log, so the import has
  // to be there or instantiation fails. On the main thread that is a plain
  // function; the worker has to fetch the same thing by URL.
  const wasm = useWasm<MathExports>(asset("math.wasm"), {
    imports: { env: { log: (x: number) => console.log("[examples] wasm logged:", x) } },
  });
  const workerWasm = useWasmWorker<MathExports>(asset("math.wasm"), {
    importsUrl: asset("wasm-imports.js"),
  });

  const ready = wasm.isReady && workerWasm.isReady && a !== null && b !== null;

  const run = async () => {
    if (!wasm.isReady || a === null || b === null) return;
    setBusy(true);
    try {
      // Main thread: a plain call, the value is just there.
      setMain({ sum: wasm.exports.add(a, b), scaled: wasm.call("scale", a, b) });
      // Worker: identical call, identical types, one await.
      setWorker({
        sum: await workerWasm.call("add", a, b),
        scaled: await workerWasm.call("scale", a, b),
      });
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Sigma className="text-primary size-4" />
        Numbers
        <Badge variant="secondary">either hook</Badge>
      </CardTitle>
      <CardDescription>
        Start here. A module whose exports only take and return numbers needs nothing from this
        library beyond the hook itself: no allocator, no <code>memory</code>, no{" "}
        <code>withScope</code>.
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
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <code className="mr-1">a</code> =
            </span>
            <NumberInput value={a} onChange={setA} min={0} max={999} label="a" testId="numbers-a" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <code className="mr-1">b</code> =
            </span>
            <NumberInput value={b} onChange={setB} min={0} max={999} label="b" testId="numbers-b" />
          </div>
          <Button onClick={run} disabled={!ready || busy} data-testid="numbers-run">
            <Play className="size-4" /> {ready ? "Run both" : "Loading…"}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ResultCard
            label="useWasm"
            sub="main thread, synchronous"
            result={main}
            testId="numbers-main"
          />
          <ResultCard
            label="useWasmWorker"
            sub="worker, awaited"
            result={worker}
            testId="numbers-worker"
          />
        </div>

        <p className="text-muted-foreground text-sm">
          The same two calls, the same types, the same answers. The only difference in the source is
          the <code>await</code>, which is why a module like this can move between the hooks freely.{" "}
          <Wasm>Wasm</Wasm> on the left ran during an ordinary <Js /> function call.
        </p>

        <CodeTabs
          testId="numbers-code-tabs"
          variants={[
            { label: "useWasm", code: MAIN },
            { label: "useWasmWorker", code: WORKER },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ResultCard({
  label,
  sub,
  result,
  testId,
}: {
  label: string;
  sub: string;
  result: { sum: number; scaled: number } | null;
  testId: string;
}) {
  return (
    <div className="border-border bg-background/40 space-y-2 rounded-lg border p-3">
      <div>
        <p className="text-foreground font-mono text-sm font-semibold">{label}</p>
        <p className="text-muted-foreground text-xs">{sub}</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">
            <code>add(a, b)</code>
          </dt>
          <dd className="tabular font-mono font-semibold" data-testid={`${testId}-add`}>
            {result ? result.sum : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">
            <code>scale(a, b)</code>
          </dt>
          <dd className="tabular font-mono font-semibold" data-testid={`${testId}-scale`}>
            {result ? result.scaled : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
