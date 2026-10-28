import { useState } from "react";
import { Type } from "lucide-react";
import { Js } from "@/components/Term";
import { stringVal, unpack } from "react-use-wasm";
import type { MemoryProps } from "@/memory-exports";
import { CodeTabs } from "@/components/CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const SNIPPET = `const { exports, withScope } = useWasm<MemoryExports>("/memory.wasm");

const reversed = withScope((s) => {
  // stringArg encodes to UTF-8 and sizes the block in BYTES, which is
  // not "hello wasm".length the moment you type a non-ASCII character.
  const text = s.stringArg("hello wasm");

  exports.upperInPlace(text.ptr, text.len);    // same length, in place

  // A new string can be a different length, so Go returns the
  // (offset, length) pair packed into one i64 -> a JS bigint.
  // stringVal reads it and frees what the module allocated.
  return stringVal(exports, exports.reverseString(text.ptr, text.len));
});`;

const BY_HAND = `const { exports } = useWasm<MemoryExports>("/memory.wasm");

// .length is characters. The allocation needs BYTES, and the two
// differ the moment anyone types a non-ASCII character.
const bytes = new TextEncoder().encode("hello wasm");

const ptr = exports.alloc(bytes.byteLength);
let reversed;
try {
  new Uint8Array(exports.memory.buffer).set(bytes, ptr);

  exports.upperInPlace(ptr, bytes.byteLength);

  // One i64 carries both halves: offset high, length low.
  const packed = exports.reverseString(ptr, bytes.byteLength);
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);

  try {
    reversed = new TextDecoder().decode(
      new Uint8Array(exports.memory.buffer.slice(outPtr, outPtr + outLen))
    );
  } finally {
    exports.free(outPtr);   // Go allocated this one, not us
  }
} finally {
  exports.free(ptr);
}`;

export function StringsExample({ e, withScope }: MemoryProps) {
  const [text, setText] = useState("hello wasm");
  const [upper, setUpper] = useState<string | null>(null);
  const [reversed, setReversed] = useState<string | null>(null);
  const [packed, setPacked] = useState<bigint | null>(null);

  const run = () => {
    if (text.length === 0) return;

    withScope((s) => {
      const buf = s.stringArg(text);

      // Same length, so it can be done in place.
      e.upperInPlace(buf.ptr, buf.len);
      setUpper(buf.read());

      // Different length is possible, so this one allocates and returns a
      // packed (offset, length) bigint.
      const result = e.reverseString(buf.ptr, buf.len);
      setPacked(result);
      setReversed(stringVal(e, result));
    });
  };

  const parts = packed === null ? null : unpack(packed);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="text-primary size-4" />
          Strings
          <Badge variant="secondary" className="font-mono">
            useWasm
          </Badge>
        </CardTitle>
        <CardDescription>
          A string is UTF-8 bytes in memory. Returning a <em>new</em> one needs two values back, so
          Go packs the offset and length into a single <code>i64</code> — which is exactly why it
          arrives in <Js /> as a <code>bigint</code>.
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

        <p className="text-muted-foreground text-sm">
          The two calls share one buffer, so the reverse runs on the bytes <code>upperInPlace</code>{" "}
          already uppercased. That is in-place mutation doing exactly what it says.
        </p>

        <CodeTabs
          testId="strings-code-tabs"
          variants={[
            { label: "withScope", code: SNIPPET },
            { label: "by hand", code: BY_HAND },
          ]}
        />
      </CardContent>
    </Card>
  );
}
