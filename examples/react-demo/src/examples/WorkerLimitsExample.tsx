import { useState } from "react";
import { useWasmWorker } from "react-use-wasm";
import { Cpu, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MemoryExports } from "@/memory-exports";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { asset } from "@/lib/asset";

const SNIPPET = `const { call } = useWasmWorker<MemoryExports>("/memory.wasm");

// Numbers cross fine. alloc takes one and returns one.
const ptr = await call("alloc", 1024);   // Promise<number>
await call("free", ptr);

// This does not work. There is no exports.memory on this side:
// the module lives in the worker, and a WebAssembly.Memory is not
// structured-cloneable, so it never comes back.
//
//   withScope(...)            <- useWasm only
//   call("sumInt32", xs)      <- xs arrives as NaN, not an array
//
// Until the hook marshals for you, the workaround is your own worker
// via the workerUrl option, doing the alloc/write/read inside it.`;

export function WorkerLimitsExample() {
  const [ptr, setPtr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // memory.wasm imports nothing, so the worker needs no importsUrl.
  const { status, error, call, reload } = useWasmWorker<MemoryExports>(asset("memory.wasm"));

  const run = async () => {
    setBusy(true);
    try {
      const p = await call("alloc", 1024);
      setPtr(p);
      await call("free", p);
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
          <Button
            onClick={run}
            disabled={status !== "ready" || busy}
            data-testid="worker-limits-run"
          >
            alloc 1 KiB in the worker
          </Button>
          <span className="tabular font-mono text-sm" data-testid="worker-limits-ptr">
            {ptr === null ? "—" : `ptr 0x${ptr.toString(16)}`}
          </span>
          {status === "loading" && (
            <span className="text-muted-foreground text-sm">starting worker…</span>
          )}
          {status === "error" && (
            <span className="text-destructive flex items-center gap-1.5 text-sm">
              <TriangleAlert className="size-4" /> {error.message}
              <Button variant="outline" size="sm" onClick={reload}>
                Retry
              </Button>
            </span>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          The pointer is real and the allocation happened, in the worker. It is also useless from
          here: writing bytes at that offset needs the buffer, and the buffer stayed behind.
        </p>

        <CodeBlock code={SNIPPET} />
      </CardContent>
    </Card>
  );
}
