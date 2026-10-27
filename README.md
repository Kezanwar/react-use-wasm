# react-use-wasm

Two React hooks for loading WebAssembly and calling its exports, with full TypeScript types on the arguments and return values.

```tsx
const { call } = useWasm<MathExports>("/math.wasm");
call("add", 2, 3);        // number
call("add", "2", 3);      // compile error
call("memory");           // compile error: not a function export
```

- **`useWasm`** runs the module on the main thread. `call` is synchronous, so you can use it straight in a render body.
- **`useWasmWorker`** runs the same module in a Web Worker. Same typed API, but `call` returns a Promise, so heavy work never blocks the UI.

No runtime dependencies. React 18+ is a peer dependency. ESM and CJS, SSR-safe, Next.js App Router ready.

---

## Install

```sh
npm install react-use-wasm
# pnpm add react-use-wasm / yarn add react-use-wasm
```

---

## Quick start: `useWasm`

```tsx
import { useWasm } from "react-use-wasm";

interface MathExports {
  memory: WebAssembly.Memory;
  add(a: number, b: number): number;
  fib(n: number): number;
}

export function Calculator() {
  const { status, error, call, reload } = useWasm<MathExports>("/math.wasm");

  if (status === "idle" || status === "loading") return <p>Loading wasm…</p>;
  if (status === "error") {
    return <p>Failed: {error.message} <button onClick={reload}>Retry</button></p>;
  }

  return <p>2 + 3 = {call("add", 2, 3)}</p>;
}
```

Or skip `call` and use the instance directly — `exports` is right there:

```tsx
const { isReady, exports } = useWasm<MathExports>("/math.wasm");
if (!isReady) return <p>Loading wasm…</p>;

return <p>2 + 3 = {exports.add(2, 3)}</p>;
```

Both `status` and `isReady` are discriminants, so either guard narrows `exports` from `T | null` to `T`, and `error` to `Error` in the error branch. That holds after destructuring.

| field     | type                                              |
| --------- | ------------------------------------------------- |
| `status`  | `"idle" \| "loading" \| "ready" \| "error"`        |
| `exports` | `T` when ready, otherwise `null`                   |
| `error`   | `Error` when errored, otherwise `null`             |
| `call`    | typed, synchronous; throws if not ready            |
| `isReady` | `true` only when ready; narrows the result         |
| `reload`  | re-fetch, recompile, re-instantiate                |

Pass `null` as the URL to skip loading entirely (the hook sits at `idle`).

---

## Quick start: `useWasmWorker`

```tsx
import { useWasmWorker } from "react-use-wasm";

export function HeavyCalculator() {
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, call, reload, terminate } = useWasmWorker<MathExports>("/math.wasm");

  const run = async () => {
    setBusy(true);
    try {
      setResult(await call("fib", 40)); // Promise<number>, UI stays responsive
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { terminate(); reload(); };

  return (
    <>
      <button onClick={run} disabled={status !== "ready" || busy}>Compute</button>
      {busy && <button onClick={cancel}>Cancel</button>}
      {result !== null && <p>fib(40) = {result}</p>}
    </>
  );
}
```

There is no `exports` field here: the instance lives in the worker and never crosses back.

---

## Typing your exports

The interface you pass as `T` is what types both `call` and `exports`. Write it to match what your `.wasm` actually exports:

```ts
interface MathExports {
  memory: WebAssembly.Memory;          // declared, but not callable
  add(a: number, b: number): number;
  countPrimes(limit: number): number;
}
```

Rules worth knowing:

- **Only function-valued properties are reachable through `call`.** `call("memory")` is a compile error — that is `WasmFunctionKeys<T>` doing its job. Use `exports.memory` when you want the memory itself.
- **`i32`, `f32` and `f64` are all `number` in JS.** Declare them as `number`.
- **`i64` is a `bigint`**, both as an argument and as a return value. Declare it as `bigint` or your numbers will silently be wrong.
- **You only declare what you use.** Undeclared exports (toolchain helpers and so on) are simply invisible to `call`.
- **`_initialize` is excluded on purpose.** See below.

Nothing validates your interface against the real module at runtime, so it is worth a test. The one in this repo instantiates the built `math.wasm` and checks every declared function exists and returns the right value: [`test/math-wasm.test.ts`](test/math-wasm.test.ts).

---

## `call` or `exports`?

For `useWasm`, both. They are equally type-safe — pick on what you need.

```tsx
const wasm = useWasm<MathExports>("/math.wasm");
if (!wasm.isReady) return null;

wasm.call("add", 2, 3);     // 5
wasm.exports.add(2, 3);     // 5 — same checks, same types
```

**Reach for `exports` when** you want the rest of the instance. `call` only exposes function exports, so `memory`, globals and tables are invisible to it — and you need `memory` for anything beyond passing numbers around, like reading a string out of linear memory. Property access also gives better autocomplete and go-to-definition than a string literal in a mapped type.

**Reach for `call` when** you want the component to read identically whether it uses `useWasm` or `useWasmWorker`. Swapping one hook for the other then means changing the import and adding an `await`, nothing else. It also throws a legible error (`useWasm: "add" called before the module was ready`) instead of a raw `TypeError` if you get the guard wrong.

**For `useWasmWorker` there is no choice.** The instance lives in the worker and never crosses back, so `call` is not a convenience there — it is the RPC that marshals the name and arguments over `postMessage` and matches the reply.

Either way you have to narrow first. `isReady` and `status === "ready"` both work:

```tsx
if (!isReady) return null;              // works
if (status !== "ready") return null;    // works
```

---

## Passing more than numbers

A wasm function can only take and return numbers — `i32`, `i64`, `f32`, `f64`. There is no string type, no array, no struct. Anything bigger travels as an **offset** into the module's linear memory, one flat `ArrayBuffer` that both sides read and write:

```ts
const { isReady, exports } = useWasm<MathExports>("/math.wasm");
if (!isReady) return null;

// 1. reserve space        2. write into it
const ptr = exports.alloc(xs.byteLength);
new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);

// 3. call with (offset, length)
const total = exports.sumInt32(ptr, xs.length);
exports.sortInt32(ptr, xs.length);              // mutates in place

// 4. read back, then free
const sorted = new Int32Array(exports.memory.buffer, ptr, xs.length);
exports.free(ptr);
```

Allocate, write, call with `(offset, length)`, read back, free. Every shape follows that pattern. The Examples tab of the demo runs all of them live with the source beside each one.

**Your module has to export an allocator.** `alloc` and `free` above are ordinary exports you write yourself; wasm does not provide them. [`examples/go/memory/memory.go`](examples/go/memory/memory.go) has a demo-grade pair.

**Returning something new needs two values, and wasm returns one.** The usual answer is to pack the offset and length into a single `i64` — which is why it arrives in JavaScript as a `bigint`:

```ts
const packed = exports.reverseString(ptr, len);   // bigint
const outPtr = Number(packed >> 32n);
const outLen = Number(packed & 0xffffffffn);
```

The other option is an out-pointer: pass a third offset and have the function write its result there. That is how `centroid` "returns" a struct.

**Structs are a layout agreement, not a type.** `type Point struct { X, Y float64 }` is 16 bytes with no padding, so JavaScript builds the same thing with a `Float64Array` and the two sides simply agree. Nothing checks this for you.

**JSON works and costs a fortune.** Serialising both ways needs no layout agreement and is the obvious reach, but in Go it pulls in the reflection machinery: the demo module is **15 kB without `encoding/json` and 186 kB with it**. Worth knowing before you reach for it.

### The one rule that catches everyone

**Never cache a typed-array view.** `memory.grow()` detaches the old `ArrayBuffer`, and every view onto it silently becomes zero length:

```ts
const view = new Uint8Array(exports.memory.buffer);
exports.somethingThatAllocates();
view.byteLength;  // 0 — detached, and nothing warned you
```

Take a fresh view off `exports.memory.buffer` every time you use it. [`examples/react-demo/src/lib/wasm-memory.ts`](examples/react-demo/src/lib/wasm-memory.ts) does exactly that, and is a reasonable starting point to copy.

---

## When to use the worker hook

Rough rule: **if a single call takes longer than about 50 ms, use `useWasmWorker`.**

At 60 fps you have 16 ms per frame. A synchronous wasm call on the main thread cannot be interrupted, so anything past a frame or two shows up as a dropped frame, a stuck animation or a button that does not respond. A `fib(40)` in the example module takes about 240 ms in Chromium; that is a quarter of a second of completely frozen page.

Note what this is *not* about. Moving to wasm buys you speed, not responsiveness. It runs the example roughly **2.8× faster** than JavaScript ([numbers below](#benchmarks)) — a real win, but `fib(40)` still freezes the page for 240 ms if you run it on the main thread. Only the worker hook fixes that.

Use `useWasm` when calls are short and you want the result during render. Use `useWasmWorker` when they are not. Both can point at the same URL; the compiled module is cached and shared between them.

---

## Benchmarks

Naive recursive `fib`, the same algorithm on both sides: [`examples/go/math/math.go`](examples/go/math/math.go) built with TinyGo, against [`examples/react-demo/src/fib.ts`](examples/react-demo/src/fib.ts) in JavaScript. Chromium 156 on an Apple M-series Mac.

| n  | JavaScript | WebAssembly | speedup |
| -- | ---------- | ----------- | ------- |
| 30 | 7 ms       | 2 ms        | 3.33×   |
| 35 | 64 ms      | 22 ms       | 2.99×   |
| 38 | 267 ms     | 95 ms       | 2.83×   |
| 40 | 687 ms     | 239 ms      | 2.87×   |
| 42 | 1738 ms    | 624 ms      | 2.78×   |

**Read this as "about 3×", not "about 10×".** Modern JavaScript JITs are very good at tight numeric recursion, which is the case wasm is *supposed* to win most easily. Expect a larger gap for code the JIT cannot keep in integers, and a smaller one (or none) for code dominated by calls across the JS boundary.

Running the same comparison inside Web Workers gives the same numbers within noise — at n = 38, 257 ms vs 92 ms. **The `postMessage` round trip costs well under a millisecond**, so the worker hook is effectively free: you give up nothing in throughput for not blocking the page.

Two things make these figures honest, and both are worth copying if you benchmark your own module:

- **Both sides are warmed up first** (at n = 24). An un-JITted first call to the JavaScript version loses by a mile, which would flatter wasm enormously.
- **The two runs are sequential**, not parallel, so they are not competing for cores.

Reproduce it yourself with `pnpm dev` — the demo computes the ratio live rather than trusting this table, and it will tell you if JavaScript wins on your machine.

---

## Imports, and why the worker needs a URL

If your module imports host functions, `useWasm` takes them directly:

```tsx
useWasm<MathExports>("/math.wasm", {
  imports: { env: { log: (x: number) => console.log(x) } },
});
```

Functions cannot be structured-cloned into a Worker, so `useWasmWorker` takes the URL of a module that provides them instead. The worker dynamically imports it on its own side:

```tsx
useWasmWorker<MathExports>("/math.wasm", { importsUrl: "/wasm-imports.js" });
```

```js
// public/wasm-imports.js — plain JS, served as-is, not processed by your bundler
export default {
  env: { log: (x) => console.log("wasm says:", x) },
};
```

The default export may be an object, or a (possibly async) function returning one — useful when the imports need setting up. A named `imports` export also works.

Relative `importsUrl` values are resolved against the page before being sent, because inside a blob worker a relative URL has no meaningful base.

> `imports` is read when loading starts. Changing it later does not trigger a reload, so an inline object literal is fine. Call `reload()` if you need new imports applied.

---

## Cancelling

A running wasm call cannot be interrupted. The only way to stop one is to kill the worker:

```tsx
const cancel = () => {
  terminate();  // kills the worker; every pending call rejects
  reload();     // starts a fresh one
};
```

`terminate()` leaves the hook at `idle`; `reload()` brings it back to `loading` then `ready`. Pending calls reject with `useWasmWorker: worker terminated`, so wrap `await call(...)` in a `try/catch` if cancelling is a normal path.

There is no equivalent for `useWasm`. A synchronous call on the main thread runs to completion, full stop.

---

## Caching

Compiled modules are cached by URL in a module-level `Map`, shared between both hooks. Two components pointing at the same `.wasm` fetch and compile it once, then instantiate it separately.

```ts
useWasm(url, { cache: false }); // opt out: fetch and compile every time

import { clearWasmCache } from "react-use-wasm";
clearWasmCache("/math.wasm"); // drop one URL
clearWasmCache();             // drop everything
```

A failed compile is evicted automatically, so a retry actually retries. `reload()` drops that URL from the cache before re-fetching.

Compilation uses `WebAssembly.compileStreaming` when the server sends `Content-Type: application/wasm`, and falls back to `compile(arrayBuffer)` otherwise. Vite and most static hosts get this right by default; some do not, and you will just silently lose streaming.

---

## The `_initialize` convention

Some toolchains emit a WASI **reactor**: a module that is a library rather than a program, which exports `_initialize` and requires it to be run once before anything else. TinyGo's `wasm-unknown` target and Go's `-buildmode=c-shared` both do this.

Both hooks call `_initialize` automatically, if it exists, before reporting `ready`. You never have to think about it. This matters: calling an export on a TinyGo module before `_initialize` traps with `unreachable`.

For the same reason `_initialize` is excluded from `WasmFunctionKeys<T>`, so `call("_initialize")` is a compile error. Declaring it in your interface is fine and harmless.

---

## SSR and Next.js

The package is safe to import on the server. Nothing touches `window`, `location`, `Worker`, `URL.createObjectURL` or `fetch` at import time; everything is deferred into effects. On the server both hooks render at their initial state (`loading`, or `idle` for a `null` URL) and start work on hydration.

The built output carries a `"use client"` directive, so it works in the Next.js App Router without you adding one. You still need `"use client"` on **your** component, as usual, because a component calling hooks is client code.

Serving the `.wasm` itself: put it in `public/` and reference it by an absolute path (`/math.wasm`). ([`test/ssr.test.tsx`](test/ssr.test.tsx) imports the built bundles in a Node process where `window`, `document`, `Worker`, `location`, `fetch` and `URL.createObjectURL` all throw on access.)

---

## CSP

`useWasmWorker` builds its worker from a `blob:` URL by default, which a strict `worker-src` or `script-src` policy will block. If that is you, host the worker script yourself:

```ts
import { WASM_WORKER_SOURCE } from "react-use-wasm";
// write WASM_WORKER_SOURCE to public/wasm-worker.js at build time
```

```tsx
useWasmWorker<MathExports>("/math.wasm", { workerUrl: "/wasm-worker.js" });
```

It must be served as an ES module (the hook creates the worker with `{ type: "module" }`), because it uses dynamic `import()` to load `importsUrl`.

You will also need `'wasm-unsafe-eval'` in `script-src` for WebAssembly compilation itself, in any browser enforcing CSP on wasm.

---

## Which toolchains work

These hooks call **raw wasm exports**. That works when your toolchain emits a plain module:

| toolchain       | works | notes                                           |
| --------------- | ----- | ----------------------------------------------- |
| TinyGo          | yes   | `-target=wasm-unknown`, with `//go:wasmexport`   |
| Zig             | yes   | `-target wasm32-freestanding`, `export fn`       |
| C / clang       | yes   | `--target=wasm32`, `-Wl,--export=…`              |
| AssemblyScript  | yes   | `export function` is a raw wasm export           |
| hand-written WAT| yes   | `(func (export "add") …)`                        |

Two common toolchains ship their own JavaScript glue and are a poor fit:

- **Rust + wasm-bindgen.** The generated `.js` owns memory, string marshalling and object lifetimes. You can still point these hooks at the `.wasm` and `call` number-in/number-out functions directly, but anything taking a string, a struct or a slice needs the generated bindings. Use those instead.
- **Emscripten.** Same story: the `.js` provides the runtime, the filesystem shims and `cwrap`/`ccall`. Use its own module loader.

Standard Go (`GOOS=js GOARCH=wasm`) **does not work.** It exports nothing callable and requires the `wasm_exec.js` runtime. Use TinyGo.

---

## The Go example

[`examples/go`](examples/go) builds **two** TinyGo modules for `wasm-unknown`, a target that produces modules with no WASI imports:

```sh
tinygo build -target=wasm-unknown -no-debug -o math.wasm .
```

| module | size | exports |
| --- | --- | --- |
| [`math/`](examples/go/math) → `math.wasm` | 1.1 kB | `add`, `fib`, `countPrimes`, `scale`, `logSum` (which calls the host's `env.log`) |
| [`memory/`](examples/go/memory) → `memory.wasm` | 186 kB | `alloc`, `free`, `sumInt32`, `sortInt32`, `scaleFloat64`, `upperInPlace`, `reverseString`, `centroid`, `jsonStats` |

Both also export `_initialize`, which TinyGo adds for you and the hooks call.

**They are two modules on purpose, and the reason is worth knowing if you benchmark your own:** V8 only applies its top optimisation tier to a wasm module while it stays small. Identical `fib` bytecode ran 20 ms in the 1.1 kB module and 34 ms once the linear-memory code was bundled in with it — a third of the speed, from nothing but the module getting bigger. Forcing TurboFan with `--js-flags=--no-liftoff` brought both back to 21 ms, confirming the code was never the problem. `USAGE.md` has the full measurements.

```go
//go:wasmimport env log
func log(x int32)

//go:wasmexport add
func add(a int32, b int32) int32 { return a + b }
```

Use explicit `int32` / `float64` parameter types so the JavaScript side is unambiguous. **An `int64` arrives in JS as a `bigint`**, not a number.

Rebuild and audit it with:

```sh
pnpm build:wasm     # rebuild (needs TinyGo) and list imports/exports
pnpm inspect:wasm   # just list imports/exports of the committed binary
```

The audit fails if anything other than `env.log` shows up in the imports, which is how you catch a build that accidentally pulled in WASI.

The built `math.wasm` is committed, so the demo and the tests run without TinyGo installed.

---

## Running the repo

```sh
pnpm install
pnpm dev           # build the package, then the Vite demo on :5173
pnpm test          # vitest: unit, worker protocol, SSR, and type tests
pnpm typecheck     # tsc --noEmit across src, tests, e2e and the demo
pnpm build         # tsup -> dist (ESM + CJS + .d.ts)
pnpm build:wasm    # rebuild both wasm modules from examples/go with TinyGo
pnpm test:browser  # Playwright against the demo in real Chromium
```

The demo at [`examples/react-demo`](examples/react-demo) (Vite, Tailwind, shadcn/ui) has two tabs.

**Benchmarks** is a head-to-head. Each hook gets a panel that runs the same naive recursive `fib` twice, once in JavaScript and once in the TinyGo module, and reports both timings:

- **`useWasm` panel** — both run on the main thread, one after the other. The frame counter in the header stalls for both, which is the point: wasm is faster, not non-blocking.
- **`useWasmWorker` panel** — the wasm side uses `useWasmWorker`, the JavaScript side a plain module worker with the same message shape, so the only variable is the language. The frame counter keeps climbing throughout, and there is a Cancel button that kills both workers mid-run and restarts them.
- **Imports panel** — `imports` on the main thread, `importsUrl` in the worker.

Both sides are warmed up before timing, otherwise an un-JITted first call to the JavaScript version would lose by a mile and the comparison would mean nothing. See [Benchmarks](#benchmarks) for the figures this produces.

**Examples** covers everything that is not a number — arrays, strings and objects — with the source beside each live result. See [Passing more than numbers](#passing-more-than-numbers).

---

## API

### `useWasm<T>(url, options?)`

| option      | type                  | default | meaning                                  |
| ----------- | --------------------- | ------- | ---------------------------------------- |
| `imports`   | `WebAssembly.Imports` | `{}`    | import object for instantiation          |
| `cache`     | `boolean`             | `true`  | share the compiled module by URL         |
| `fetchInit` | `RequestInit`         | —       | extra fetch options (headers, cookies)   |

### `useWasmWorker<T>(url, options?)`

| option       | type          | default         | meaning                                    |
| ------------ | ------------- | --------------- | ------------------------------------------ |
| `importsUrl` | `string`      | —               | URL of an ES module providing the imports  |
| `cache`      | `boolean`     | `true`          | share the compiled module by URL           |
| `fetchInit`  | `RequestInit` | —               | extra fetch options                        |
| `workerUrl`  | `string`      | inline blob URL | your own copy of `WASM_WORKER_SOURCE`      |

Adds `terminate()` to the result, and `call` returns a Promise. There is no `exports` field: the instance lives in the worker, so `call` is the only way in.

### Also exported

`clearWasmCache(url?)`, `WASM_WORKER_SOURCE`, and the types `UseWasmOptions`, `UseWasmResult`, `UseWasmState`, `UseWasmHelpers`, `UseWasmWorkerOptions`, `UseWasmWorkerResult`, `UseWasmWorkerState`, `UseWasmWorkerHelpers`, `WasmFunctionKeys`.

---

## License

MIT
