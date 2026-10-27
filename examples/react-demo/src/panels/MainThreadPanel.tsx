import { useState } from "react";
import { useWasm } from "react-use-wasm";
import { Cpu, Play, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { jsFib } from "@/fib";
import { BenchCard, Verdict } from "@/components/BenchCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Cpu className="text-primary size-4" />
        <code className="text-base">useWasm</code>
        <Badge variant="secondary">main thread</Badge>
      </CardTitle>
      <CardDescription>
        <code>call</code> is synchronous, so results can be used straight in a render body.
        Both sides run here on the main thread: <Js /> first, then <Wasm>wasm</Wasm>.
      </CardDescription>
    </CardHeader>
  );

  if (status === "idle" || status === "loading") {
    return (
      <Card>
        {header}
        <CardContent className="text-muted-foreground text-sm">Loading wasm…</CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        {header}
        <CardContent className="space-y-3">
          <p className="text-destructive flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4" /> {error.message}
          </p>
          <Button variant="outline" size="sm" onClick={reload}>
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
        <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <code>add(2, 3)</code> ={" "}
            <strong className="text-foreground tabular" data-testid="add-result">
              {call("add", 2, 3)}
            </strong>
          </span>
          <span>
            <code>scale(2.5, 4)</code> ={" "}
            <strong className="text-foreground tabular" data-testid="scale-result">
              {call("scale", 2.5, 4)}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              <code>fib(n)</code>, n =
            </span>
            <Input
              type="number"
              value={n}
              min={0}
              max={42}
              data-testid="main-n"
              onChange={(e) => setN(Number(e.target.value))}
              className="tabular w-24"
            />
          </label>
          <Button onClick={run} disabled={busy} data-testid="main-run">
            <Play className="size-4" /> Run both
          </Button>
          {busy && (
            <span className="text-muted-foreground text-sm" data-testid="main-busy">
              Computing… (the page is frozen)
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BenchCard
            label="JavaScript"
            sub="naive recursion, JIT compiled"
            tone="js"
            ms={jsMs}
            value={jsValue}
            busy={busy}
            faster={jsMs !== null && wasmMs !== null && jsMs < wasmMs}
            testId="main-js"
          />
          <BenchCard
            label="WebAssembly"
            sub="same algorithm, TinyGo"
            tone="wasm"
            ms={wasmMs}
            value={wasmValue}
            busy={busy}
            faster={jsMs !== null && wasmMs !== null && wasmMs < jsMs}
            testId="main-wasm"
          />
        </div>

        <Verdict js={jsMs} wasm={wasmMs} testId="main-verdict" />

        <p className="text-muted-foreground text-xs">
          Both run on the main thread, one after the other, each warmed up at n = {WARMUP_N} first.
          Push n past 35 and watch the frame counter above stop dead for both: faster is not the
          same as non-blocking.
        </p>
      </CardContent>
    </Card>
  );
}
