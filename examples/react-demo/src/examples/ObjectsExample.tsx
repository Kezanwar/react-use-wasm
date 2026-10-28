import { useState } from "react";
import { Boxes, TriangleAlert } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import { stringVal } from "react-use-wasm";
import type { MemoryProps } from "@/memory-exports";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const STRUCT_SNIPPET = `// Go:  type Point struct { X, Y float64 }  -> 16 bytes, no padding.
// JS simply agrees on the same layout.
const [x, y] = withScope((s) => {
  const pts = s.f64ArrayArg([0,0, 10,0, 10,10, 0,10]);

  // Wasm cannot return a struct, so it writes through an out-pointer.
  // *Out reserves empty space; *Arg copies data in.
  const out = s.f64ArrayOut(2);
  exports.centroid(pts.ptr, pts.len / 2, out.ptr);

  return out.read();
});`;

const JSON_SNIPPET = `const stats = withScope((s) => {
  const json = s.stringArg(JSON.stringify(people));

  // Go unmarshals, computes, marshals, and returns the result string
  // as a packed (offset, length) bigint. 0n means it would not parse,
  // and stringVal turns that into null.
  return stringVal(exports, exports.jsonStats(json.ptr, json.len));
});`;

const DEFAULT_POINTS = "0,0  10,0  10,10  0,10";
const DEFAULT_PEOPLE = `[
  { "name": "Ada", "age": 36 },
  { "name": "Alan", "age": 41 },
  { "name": "Grace", "age": 45 }
]`;

function parsePoints(text: string): Float64Array {
  const nums = text
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  // Drop a trailing odd value rather than reading past the end.
  return Float64Array.from(nums.slice(0, nums.length - (nums.length % 2)));
}

export function ObjectsExample({ e, withScope }: MemoryProps) {
  const [pointText, setPointText] = useState(DEFAULT_POINTS);
  const [centroid, setCentroid] = useState<[number, number] | null>(null);

  const [peopleText, setPeopleText] = useState(DEFAULT_PEOPLE);
  const [stats, setStats] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState(false);

  const runStruct = () => {
    const flat = parsePoints(pointText);
    if (flat.length === 0) return;
    const count = flat.length / 2;

    withScope((s) => {
      const pts = s.f64ArrayArg(flat);
      const out = s.f64ArrayOut(2);
      e.centroid(pts.ptr, count, out.ptr);
      const [x, y] = out.read();
      setCentroid([x!, y!]);
    });
  };

  const runJson = () => {
    if (peopleText.length === 0) return;
    withScope((s) => {
      const json = s.stringArg(peopleText);
      const result = stringVal(e, e.jsonStats(json.ptr, json.len));
      setJsonError(result === null);
      setStats(result);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Boxes className="text-primary size-4" />
          Objects, two ways
        </CardTitle>
        <CardDescription>
          There is no one way to pass a struct. The trade-off is real and worth seeing: agreeing on
          a byte layout is free, serialising is easy.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Fixed struct layout</h3>
            <Badge variant="secondary">0 kB</Badge>
            <span className="text-muted-foreground text-xs">
              fastest, but <Js /> and <Wasm>wasm</Wasm> must agree on the bytes
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              value={pointText}
              onChange={(ev) => setPointText(ev.target.value)}
              data-testid="objects-points"
              aria-label="Points as x,y pairs"
              className="border-input bg-background focus-visible:ring-ring h-9 max-w-xs flex-1 rounded-md border px-3 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <Button onClick={runStruct} data-testid="objects-struct-run">
              centroid
            </Button>
            <span className="tabular font-mono text-sm" data-testid="objects-centroid">
              {centroid ? `(${centroid[0]}, ${centroid[1]})` : "—"}
            </span>
          </div>

          <CodeBlock code={STRUCT_SNIPPET} />
        </section>

        <Separator />

        {/* ---------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">JSON</h3>
            <Badge variant="destructive">+150 kB</Badge>
            <span className="text-muted-foreground text-xs">
              easy, but <code>encoding/json</code> drags in Go's reflection
            </span>
          </div>

          <textarea
            value={peopleText}
            onChange={(ev) => setPeopleText(ev.target.value)}
            rows={6}
            data-testid="objects-json"
            aria-label="People as JSON"
            className="border-input bg-background focus-visible:ring-ring w-full rounded-md border p-3 font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runJson} data-testid="objects-json-run">
              jsonStats
            </Button>
            {jsonError ? (
              <span
                className="text-destructive flex items-center gap-1.5 text-sm"
                data-testid="objects-stats"
              >
                <TriangleAlert className="size-4" /> returned 0n — the module could not parse that
              </span>
            ) : (
              <span className="font-mono text-sm" data-testid="objects-stats">
                {stats ?? "—"}
              </span>
            )}
          </div>

          <CodeBlock code={JSON_SNIPPET} />

          <p className="text-muted-foreground text-xs">
            This single feature is why the demo module is 186 kB rather than 15 kB. For a module you
            ship, that is usually the deciding argument for the struct layout above.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
