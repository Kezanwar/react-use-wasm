import { useState } from "react";
import { Type } from "lucide-react";
import { Js } from "@/components/Term";
import type { MathExports } from "@/math-exports";
import { encode, readString, takePackedString, unpack, withAlloc, writeBytes } from "@/lib/wasm-memory";
import { CodeBlock } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const SNIPPET = `const bytes = new TextEncoder().encode("hello wasm");
const ptr = exports.alloc(bytes.length);
new Uint8Array(exports.memory.buffer).set(bytes, ptr);

exports.upperInPlace(ptr, bytes.length);           // same length, in place

// A new string can be a different length, so Go returns the
// (offset, length) pair packed into one i64 -> a JS bigint.
const packed = exports.reverseString(ptr, bytes.length);
const outPtr = Number(packed >> 32n);
const outLen = Number(packed & 0xffffffffn);

const result = new TextDecoder().decode(
  new Uint8Array(exports.memory.buffer, outPtr, outLen)
);
exports.free(outPtr);
exports.free(ptr);`;

export function StringsExample({ e }: { e: MathExports }) {
  const [text, setText] = useState("hello wasm");
  const [upper, setUpper] = useState<string | null>(null);
  const [reversed, setReversed] = useState<string | null>(null);
  const [packed, setPacked] = useState<bigint | null>(null);

  const run = () => {
    const bytes = encode(text);
    if (bytes.length === 0) return;

    withAlloc(e, bytes.length, (ptr) => {
      writeBytes(e, ptr, bytes);

      // Same length, so it can be done in place.
      e.upperInPlace(ptr, bytes.length);
      setUpper(readString(e, ptr, bytes.length));

      // Different length is possible, so this one allocates and returns a
      // packed (offset, length) bigint.
      const result = e.reverseString(ptr, bytes.length);
      setPacked(result);
      setReversed(takePackedString(e, result));
    });
  };

  const parts = packed === null ? null : unpack(packed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="text-primary size-4" />
          Strings
        </CardTitle>
        <CardDescription>
          A string is UTF-8 bytes in memory. Returning a <em>new</em> one needs two values back,
          so Go packs the offset and length into a single <code>i64</code> — which is exactly why
          it arrives in <Js /> as a <code>bigint</code>.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            data-testid="strings-input"
            className="max-w-xs font-mono"
            aria-label="Text to send to wasm"
          />
          <Button onClick={run} data-testid="strings-run">
            Uppercase and reverse
          </Button>
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">upperInPlace</dt>
            <dd className="font-mono font-semibold" data-testid="strings-upper">
              {upper ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">reverseString (of the above)</dt>
            <dd className="font-mono font-semibold" data-testid="strings-reversed">
              {reversed ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">raw packed i64</dt>
            <dd className="tabular font-mono text-xs" data-testid="strings-packed">
              {packed === null ? "—" : `${packed}n`}
              {parts && (
                <span className="text-muted-foreground block">
                  offset {parts.ptr}, length {parts.len}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground text-xs">
          The two calls share one buffer, so the reverse runs on the bytes{" "}
          <code>upperInPlace</code> already uppercased. That is in-place
          mutation doing exactly what it says.
        </p>

        <CodeBlock code={SNIPPET} />
      </CardContent>
    </Card>
  );
}
