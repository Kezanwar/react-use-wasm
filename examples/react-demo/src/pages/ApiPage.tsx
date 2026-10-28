import type { ReactNode } from "react";
import { Boxes, Cpu, Download, MemoryStick, Wrench } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import { CodeBlock, HighlightedCode } from "@/components/CodeBlock";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/**
 * The public surface, hand-written rather than generated: the useful part
 * of an API page is the sentence saying when to reach for each thing, and
 * a generator cannot write that.
 */

function Entry({
  name,
  signature,
  badge,
  children,
}: {
  name: string;
  signature: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-foreground font-mono text-sm font-semibold">{name}</h3>
        {badge && (
          <Badge variant="secondary" className="font-normal">
            {badge}
          </Badge>
        )}
      </div>
      <HighlightedCode
        code={signature}
        className="border-border bg-muted/50 rounded-md border px-3 py-2 text-[12px] leading-relaxed"
      />
      <div className="text-muted-foreground space-y-2 text-sm">{children}</div>
    </div>
  );
}

const INSTALL = `pnpm add react-use-wasm`;

const USE_WASM = `const { status, isReady, exports, error, call, withScope, reload } =
  useWasm<MathExports>("/math.wasm", {
    imports: { env: { log: console.log } },
    cache: true,
    allocator: { alloc: "malloc", free: "free" },
    fetchInit: { credentials: "include" },
  });`;

const STATE = `type UseWasmState<T> =
  | { status: "idle";    isReady: false; exports: null; error: null }
  | { status: "loading"; isReady: false; exports: null; error: null }
  | { status: "ready";   isReady: true;  exports: T;    error: null }
  | { status: "error";   isReady: false; exports: null; error: Error };`;

const WORKER = `const { status, isReady, error, call, terminate, reload } =
  useWasmWorker<MathExports>("/math.wasm", {
    importsUrl: "/wasm-imports.js",  // functions can't be posted to a worker
    workerUrl: "/my-worker.js",      // for a strict CSP that blocks blob:
  });

const value = await call("fib", 40);  // Promise<number>`;

const ALLOCATOR = `interface WasmAllocator {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  free(ptr: number): void;
}

// Declaring it is what makes withScope callable:
interface MemoryExports extends WasmAllocator {
  sumInt32(ptr: number, len: number): number;
}`;

const SCOPE = `withScope((s) => {
  // *Arg copies data in. len is what wasm wants: element count for
  // arrays, UTF-8 byte length for strings.
  s.stringArg(text)        // WasmBlock<string>
  s.bytesArg(u8)           // WasmBlock<Uint8Array>
  s.i32ArrayArg(xs)        // WasmBlock<Int32Array>
  s.f64ArrayArg(xs)        // WasmBlock<Float64Array>

  // *Out reserves empty space for wasm to write into.
  s.bytesOut(byteLength)   // WasmBlock<Uint8Array>
  s.i32ArrayOut(len)       // WasmBlock<Int32Array>
  s.f64ArrayOut(len)       // WasmBlock<Float64Array>

  s.alloc(byteLength)      // raw reservation, when none of the above fit
});`;

const BLOCK = `interface WasmBlock<R> {
  readonly ptr: number;         // pass this to wasm
  readonly len: number;         // elements for arrays, bytes for strings
  readonly byteLength: number;  // what was actually reserved
  read(): R;                    // always a copy, never a view
}`;

const PACKED = `// Wasm returns one value, so a function handing back freshly
// allocated data packs (offset, length) into an i64 -> a JS bigint.
stringVal(exports, packed)   // string | null, and frees it
bytesVal(exports, packed)    // Uint8Array | null, and frees it
unpack(packed)               // { ptr, len }, if you want it raw`;

export function ApiPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="text-primary size-4" />
            Install
          </CardTitle>
          <CardDescription>
            React 18 or 19 as a peer dependency, and no others. ESM and CJS, with a{" "}
            <code>"use client"</code> banner so it drops into a Next.js app router without ceremony.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={INSTALL} label="Shell" language="bash" />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Boxes className="text-primary size-4" />
            <span className="font-mono">useWasm</span>
            <Badge variant="secondary">main thread</Badge>
          </CardTitle>
          <CardDescription>
            Loads, compiles and instantiates a module, then gives you its exports synchronously.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CodeBlock code={USE_WASM} label="TypeScript" language="tsx" />

          <Entry name="status / isReady / exports / error" signature={STATE}>
            <p>
              A discriminated union, and <code>isReady</code> carries a literal type per branch
              rather than a derived boolean. That makes it a second discriminant, so{" "}
              <code>if (isReady)</code> narrows <code>exports</code> from <code>T | null</code> to{" "}
              <code>T</code> even after destructuring.
            </p>
          </Entry>

          <Entry
            name="call"
            signature={`call<K extends WasmFunctionKeys<T>>(name: K, ...args): ReturnType`}
          >
            <p>
              Optional on this hook: once narrowed you can use <code>exports.add(2, 3)</code>{" "}
              directly, which also reaches <code>memory</code>, globals and tables.{" "}
              <code>call</code> exists so a component reads the same whichever hook it uses.{" "}
              <code>_initialize</code> is excluded at the type level, because the hook already ran
              it.
            </p>
          </Entry>

          <Entry name="reload" signature={`reload(): void`}>
            <p>
              Drops the cached module and re-fetches. Also how you apply changed{" "}
              <code>imports</code>, which are read once when loading starts.
            </p>
          </Entry>

          <Entry name="url" signature={`useWasm<T>(url: string | null, options?)`}>
            <p>
              Pass <code>null</code> to skip loading entirely, which is how you make it conditional
              without breaking the rules of hooks.
            </p>
          </Entry>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="text-primary size-4" />
            <span className="font-mono">useWasmWorker</span>
            <Badge variant="secondary">off thread</Badge>
          </CardTitle>
          <CardDescription>
            The same module in a Web Worker, so a long call never freezes the page.{" "}
            <code>call</code> returns a Promise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <CodeBlock code={WORKER} label="TypeScript" language="tsx" />

          <Entry
            name="call"
            badge="numbers and bigints only"
            signature={`call(name, ...args): Promise<R>`}
          >
            <p>
              Arguments and results cross by structured clone. There is no <code>exports</code> and
              no <code>withScope</code> on this hook: a <code>WebAssembly.Memory</code> is not
              cloneable, so the module's memory stays in the worker. See the worker card on the
              Examples tab.
            </p>
          </Entry>

          <Entry name="terminate" signature={`terminate(): void`}>
            <p>
              Kills the worker immediately and rejects every pending call. The only way to cancel a
              runaway computation, since <Wasm>wasm</Wasm> has no interrupt.
            </p>
          </Entry>

          <Entry name="importsUrl" signature={`importsUrl?: string`}>
            <p>
              Functions cannot be posted to a worker, so imports are given as the URL of an ES
              module the worker imports itself. Its default export is the import object, or an
              (async) function returning one.
            </p>
          </Entry>

          <Entry name="workerUrl" signature={`workerUrl?: string`}>
            <p>
              By default the worker is an inline <code>blob:</code> URL, so no bundler config is
              needed. Under a CSP that blocks blob workers, write <code>WASM_WORKER_SOURCE</code>{" "}
              out as a file, serve it, and point this at it.
            </p>
          </Entry>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MemoryStick className="text-primary size-4" />
            Memory
            <Badge variant="secondary">useWasm only</Badge>
          </CardTitle>
          <CardDescription>
            For passing anything bigger than a number. Opt-in: a module with no allocator is
            unaffected and every one of these is tree-shaken away if you never import it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Entry name="WasmAllocator" signature={ALLOCATOR}>
            <p>
              The contract. Nothing is required of a module to use the hooks, only to use the memory
              layer. If your toolchain names them differently, pass{" "}
              <code>{`{ allocator: { alloc: "malloc" } }`}</code> rather than renaming your exports.
            </p>
          </Entry>

          <Separator />

          <Entry name="withScope" signature={SCOPE}>
            <p>
              Everything the scope hands out is freed when the body returns, including when it
              throws. The helpers size the allocation themselves, which is the part that bites:{" "}
              <code>alloc</code> wants bytes, wasm functions want element counts, and{" "}
              <code>"héllo"</code> is five characters but six bytes.
            </p>
            <p>
              <strong className="text-foreground">The body must be synchronous.</strong> An async
              one would free its memory before the work ran, so that throws instead.
            </p>
          </Entry>

          <Entry name="WasmBlock" signature={BLOCK}>
            <p>
              What a scope helper returns. <code>read()</code> copies rather than handing back a
              view, so the value survives both the free and any <code>memory.grow()</code> along the
              way.
            </p>
          </Entry>

          <Separator />

          <Entry name="stringVal / bytesVal / unpack" signature={PACKED}>
            <p>
              <code>0n</code> is the conventional failure signal and comes back as <code>null</code>
              . Only use these on data the module freshly allocated: they free the pointer, so a
              pointer into static data would be freed wrongly.
            </p>
          </Entry>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="text-primary size-4" />
            Odds and ends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Entry name="clearWasmCache" signature={`clearWasmCache(url?: string): void`}>
            <p>
              Compiled modules are cached by URL and shared between both hooks, so a second
              component pays instantiation only. Clear one URL, or all of them.
            </p>
          </Entry>

          <Entry name="memorySize" signature={`memorySize(exports): number`}>
            <p>
              Current size of the module's linear memory in bytes. Handy for watching a{" "}
              <code>grow()</code> happen.
            </p>
          </Entry>

          <Entry name="resolveAllocator" signature={`resolveAllocator(exports, names?): Allocator`}>
            <p>
              The lookup <code>withScope</code> does internally, exported for use outside React — in
              a worker, in tests, in plain <Js />.
            </p>
          </Entry>

          <Entry name="WASM_WORKER_SOURCE" signature={`const WASM_WORKER_SOURCE: string`}>
            <p>
              The worker script as a string. Write it to a file for the <code>workerUrl</code>{" "}
              escape hatch, or fork it to add your own message types.
            </p>
          </Entry>
        </CardContent>
      </Card>
    </div>
  );
}
