import { useState } from "react";
import { Brackets } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import type { MemoryProps } from "@/memory-exports";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SNIPPET = `const { exports, withScope } = useWasm<MemoryExports>("/memory.wasm");

// The scope allocates, writes, and frees on the way out.
const { total, sorted } = withScope((s) => {
  const xs = s.i32ArrayArg([5, 3, 9, 1, 7]);

  const total = exports.sumInt32(xs.ptr, xs.len);  // read-only
  exports.sortInt32(xs.ptr, xs.len);               // mutates in place

  return { total, sorted: [...xs.read()] };        // read() copies out
});`;

const parse = (text: string): Int32Array =>
  Int32Array.from(
    text
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  );

export function ArraysExample({ e, withScope }: MemoryProps) {
  const [text, setText] = useState("5, 3, 9, 1, 7");
  const [sum, setSum] = useState<number | null>(null);
  const [sorted, setSorted] = useState<number[] | null>(null);
  const [offset, setOffset] = useState<number | null>(null);

  const run = () => {
    const xs = parse(text);
    if (xs.length === 0) return;

    // One allocation, two calls, then free. The scope guarantees the free
    // even if something throws in between.
    withScope((s) => {
      const buf = s.i32ArrayArg(xs);
      setOffset(buf.ptr);

      setSum(e.sumInt32(buf.ptr, buf.len));
      e.sortInt32(buf.ptr, buf.len);
      setSorted([...buf.read()]);
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

        <CodeBlock code={SNIPPET} label="TypeScript" />
      </CardContent>
    </Card>
  );
}
