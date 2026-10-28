import { memorySize, useWasm } from "react-use-wasm";
import { MemoryStick, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MemoryExports } from "@/memory-exports";
import { NumbersExample } from "@/examples/NumbersExample";
import { ArraysExample } from "@/examples/ArraysExample";
import { StringsExample } from "@/examples/StringsExample";
import { ObjectsExample } from "@/examples/ObjectsExample";
import { WorkerLimitsExample } from "@/examples/WorkerLimitsExample";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { asset } from "@/lib/asset";

/**
 * Two halves, in this order on purpose: what the hook does on its own,
 * then what the memory layer adds. The page used to open on the linear
 * memory protocol, which read as though it were a requirement.
 */
export function ExamplesPage() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Two things to separate. <Wasm>Wasm</Wasm> functions only take and return numbers, and for a
        module that only deals in numbers the hook is the whole story. Everything larger needs a
        protocol on top, which the second half is about.
      </p>

      <NumbersExample />

      <MemorySection />

      <WorkerLimitsExample />
    </div>
  );
}

/**
 * The memory examples share one instance of the 186 kB module, so the hook
 * lives here rather than in each card. It is also why this is a component
 * and not three siblings: while it loads, the rest of the page still
 * renders.
 */
function MemorySection() {
  // A different module from the Benchmarks tab: /memory.wasm is where the
  // linear-memory exports live, and it imports nothing at all.
  const wasm = useWasm<MemoryExports>(asset("memory.wasm"));

  const intro = (
    <div className="space-y-3">
      <h2 className="text-foreground text-lg font-bold tracking-tight">
        Passing more than numbers
      </h2>
      <p className="text-muted-foreground text-sm">
        Anything bigger travels as an <strong className="text-foreground">offset</strong> into one
        flat <code>ArrayBuffer</code> that both <Js /> and <Wasm>wasm</Wasm> can read and write:{" "}
        <code>exports.memory.buffer</code>. Every example below is the same four steps — allocate,
        write, call with <code>(offset, length)</code>, read back, free. The package's{" "}
        <code>withScope</code> owns all four so you never pair an <code>alloc</code> with a{" "}
        <code>free</code> by hand. Flip any block to{" "}
        <strong className="text-foreground">by hand</strong> to see what it replaces.
      </p>
    </div>
  );

  if (wasm.status === "error") {
    return (
      <div className="space-y-4">
        {intro}
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-destructive flex items-center gap-2 text-sm">
              <TriangleAlert className="size-4" /> {wasm.error.message}
            </p>
            <Button variant="outline" size="sm" onClick={wasm.reload}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // isReady is a discriminant, so this one line narrows `exports` from
  // `MemoryExports | null` to `MemoryExports` for everything below.
  if (!wasm.isReady) {
    return (
      <div className="space-y-4">
        {intro}
        <p className="text-muted-foreground text-sm">Loading wasm…</p>
      </div>
    );
  }

  const e = wasm.exports;

  return (
    <div className="space-y-6">
      {intro}

      <div className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
        <MemoryStick className="text-primary size-3.5" />
        <span className="tabular text-foreground" data-testid="memory-size">
          linear memory: {(memorySize(e) / 1024).toLocaleString()} KiB
        </span>
        <span className="text-muted-foreground">(refreshes when you run something)</span>
      </div>

      <ArraysExample e={e} withScope={wasm.withScope} />
      <StringsExample e={e} withScope={wasm.withScope} />
      <ObjectsExample e={e} withScope={wasm.withScope} />

      <p className="text-muted-foreground text-sm">
        One rule catches everyone: never cache a typed-array view. <code>memory.grow()</code>{" "}
        detaches the old <code>ArrayBuffer</code> and every view onto it becomes zero-length. Every
        helper takes a fresh view at the moment it is used, and <code>read()</code> always copies
        out, for exactly this reason.
      </p>
    </div>
  );
}
