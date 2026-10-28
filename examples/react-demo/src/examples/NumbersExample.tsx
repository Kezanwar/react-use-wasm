import { useState } from "react";
import { useWasm } from "react-use-wasm";
import { Sigma, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { CodeBlock } from "@/components/CodeBlock";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { asset } from "@/lib/asset";

const SNIPPET = `const { isReady, exports } = useWasm<MathExports>("/math.wasm");
if (!isReady) return <p>Loading…</p>;

// That one guard narrows exports from MathExports | null to
// MathExports, so this is fully typed and runs during render.
return <p>{a} + {b} = {exports.add(a, b)}</p>;`;

/**
 * The baseline: numbers in, numbers out, no allocator and no memory.
 *
 * Deliberately first on the page. Everything below it is about getting
 * larger values across, which is easy to mistake for a requirement rather
 * than the opt-in extra it is.
 */
export function NumbersExample() {
  const [a, setA] = useState<number | null>(2);
  const [b, setB] = useState<number | null>(3);

  // math.wasm calls back into the host through env.log, so the import has
  // to be there or instantiation fails.
  const wasm = useWasm<MathExports>(asset("math.wasm"), {
    imports: { env: { log: (x: number) => console.log("[examples] wasm logged:", x) } },
  });

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

  if (!wasm.isReady) {
    return (
      <Card>
        {header}
        <CardContent className="text-muted-foreground text-sm">Loading wasm…</CardContent>
      </Card>
    );
  }

  const e = wasm.exports;
  const ready = a !== null && b !== null;

  return (
    <Card>
      {header}
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              <code className="mr-1">a</code> =
            </span>
            <NumberInput value={a} onChange={setA} min={0} max={999} label="a" testId="numbers-a" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              <code className="mr-1">b</code> =
            </span>
            <NumberInput value={b} onChange={setB} min={0} max={999} label="b" testId="numbers-b" />
          </div>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">
              <code>add(a, b)</code>
            </dt>
            <dd className="tabular font-mono font-semibold" data-testid="numbers-add">
              {ready ? e.add(a, b) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              <code>scale(a, b)</code>, float64
            </dt>
            <dd className="tabular font-mono font-semibold" data-testid="numbers-scale">
              {ready ? e.scale(a, b) : "—"}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground text-xs">
          No Run button, because there is nothing to wait for. <Wasm>Wasm</Wasm> ran during the
          render that produced those numbers, the same as any other <Js /> function call. That is
          the whole of <code>useWasm</code> for a module like this.
        </p>

        <CodeBlock code={SNIPPET} label="TypeScript" />
      </CardContent>
    </Card>
  );
}
