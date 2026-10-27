import { useWasm } from "react-use-wasm";
import { MemoryStick, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MemoryExports } from "@/memory-exports";
import { memorySize } from "@/lib/wasm-memory";
import { ArraysExample } from "@/examples/ArraysExample";
import { StringsExample } from "@/examples/StringsExample";
import { ObjectsExample } from "@/examples/ObjectsExample";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { asset } from "@/lib/asset";

/**
 * Everything on this page needs the live instance rather than `call`,
 * because `call` only reaches function exports and the whole subject here is
 * `exports.memory`.
 *
 * One `useWasm` for the page, passed down. The compiled module is cached by
 * URL, so this costs nothing beyond the instantiation even though the
 * Benchmarks tab loads the same file.
 */
export function ExamplesPage() {
  // A different module from the Benchmarks tab: /memory.wasm is where the
  // linear-memory exports live, and it imports nothing at all.
  const wasm = useWasm<MemoryExports>(asset("memory.wasm"));

  if (wasm.status === "error") {
    return (
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
    );
  }

  // isReady is a discriminant, so this one line narrows `exports` from
  // `MathExports | null` to `MathExports` for everything below.
  if (!wasm.isReady) {
    return <p className="text-muted-foreground text-sm">Loading wasm…</p>;
  }

  const e = wasm.exports;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          A <Wasm>wasm</Wasm> function can only take and return numbers. Anything bigger travels
          as an <strong className="text-foreground">offset</strong> into one flat{" "}
          <code>ArrayBuffer</code> that both <Js /> and <Wasm>wasm</Wasm> can read and write:{" "}
          <code>exports.memory.buffer</code>. Every example below is the same four steps —
          allocate, write, call with <code>(offset, length)</code>, read back, free.
        </p>

        <div className="border-border bg-card text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
          <MemoryStick className="size-3.5" />
          <span className="tabular" data-testid="memory-size">
            linear memory: {(memorySize(e) / 1024).toLocaleString()} KiB
          </span>
          <span className="opacity-60">(refreshes when you run something)</span>
        </div>
      </div>

      <ArraysExample e={e} />
      <StringsExample e={e} />
      <ObjectsExample e={e} />

      <p className="text-muted-foreground text-xs">
        One rule catches everyone: never cache a typed-array view.{" "}
        <code>memory.grow()</code> detaches the old{" "}
        <code>ArrayBuffer</code> and every view onto it becomes zero-length.
        The helpers in <code>src/lib/wasm-memory.ts</code> take a fresh view
        every time for exactly this reason.
      </p>
    </div>
  );
}
