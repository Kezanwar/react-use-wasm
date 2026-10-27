import { useState } from "react";
import { Brackets } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { readInt32Array, withAlloc, writeInt32Array } from "@/lib/wasm-memory";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SNIPPET = `// JS owns the data, wasm reads and writes it in place.
const xs = Int32Array.from([5, 3, 9, 1, 7]);

const ptr = exports.alloc(xs.byteLength);          // reserve
new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);  // write

const total = exports.sumInt32(ptr, xs.length);    // read-only
exports.sortInt32(ptr, xs.length);                 // mutates in place

const sorted = new Int32Array(exports.memory.buffer, ptr, xs.length);
exports.free(ptr);`;

const parse = (text: string): Int32Array =>
  Int32Array.from(
    text
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  );

export function ArraysExample({ e }: { e: MathExports }) {
  const [text, setText] = useState("5, 3, 9, 1, 7");
  const [sum, setSum] = useState<number | null>(null);
  const [sorted, setSorted] = useState<number[] | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  const run = () => {
    const xs = parse(text);
    if (xs.length === 0) return;

    // One allocation, two calls, then free. withAlloc guarantees the free
    // even if something throws in between.
    withAlloc(e, xs.byteLength, (ptr) => {
      setOffset(ptr);
      writeInt32Array(e, ptr, xs);

      setSum(e.sumInt32(ptr, xs.length));
      e.sortInt32(ptr, xs.length);
      setSorted([...readInt32Array(e, ptr, xs.length)]);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brackets className="text-primary size-4" />
          Arrays
        </CardTitle>
        <CardDescription>
          An <code>Int32Array</code> is written into linear memory and passed as{" "}
          <code>(offset, length)</code>. <Wasm>Wasm</Wasm> sorts it in place and <Js /> reads the
          same bytes back.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            data-testid="arrays-input"
            className="font-mono max-w-xs"
            aria-label="Comma separated integers"
          />
          <Button onClick={run} data-testid="arrays-run">
            Sum and sort
          </Button>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">sumInt32</dt>
            <dd className="tabular font-semibold" data-testid="arrays-sum">
              {sum ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">sortInt32, read back</dt>
            <dd className="tabular font-mono" data-testid="arrays-sorted">
              {sorted ? `[${sorted.join(", ")}]` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">offset used</dt>
            <dd className="tabular font-mono" data-testid="arrays-offset">
              {offset === null ? "—" : `0x${offset.toString(16)}`}
            </dd>
          </div>
        </dl>

        <CodeBlock code={SNIPPET} />
      </CardContent>
    </Card>
  );
}
