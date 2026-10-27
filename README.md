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

`status` is a discriminated union, so `exports` is `T` only in the `ready` branch and `error` is an `Error` only in the `error` branch.

| field     | type                                              |
| --------- | ------------------------------------------------- |
| `status`  | `"idle" \| "loading" \| "ready" \| "error"`        |
| `exports` | `T` when ready, otherwise `null`                   |
| `error`   | `Error` when errored, otherwise `null`             |
| `call`    | typed, synchronous; throws if not ready            |
| `isReady` | `status === "ready"`                               |
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

The interface you pass as `T` is what gives `call` its types. Write it to match what your `.wasm` actually exports:

```ts
interface MathExports {
  memory: WebAssembly.Memory;          // declared, but not callable
  add(a: number, b: number): number;
  countPrimes(limit: number): number;
}
```

Rules worth knowing:

- **Only function-valued properties are callable.** `call("memory")` is a compile error. That is `WasmFunctionKeys<T>` doing its job.
- **`i32`, `f32` and `f64` are all `number` in JS.** Declare them as `number`.
- **`i64` is a `bigint`**, both as an argument and as a return value. Declare it as `bigint` or your numbers will silently be wrong.
- **You only declare what you use.** Undeclared exports (toolchain helpers and so on) are simply invisible to `call`.
- **`_initialize` is excluded on purpose.** See below.

Nothing validates your interface against the real module at runtime, so it is worth a test. The one in this repo instantiates the built `math.wasm` and checks every declared function exists and returns the right value: [`test/math-wasm.test.ts`](test/math-wasm.test.ts).

---

## When to use the worker hook

Rough rule: **if a single call takes longer than about 50 ms, use `useWasmWorker`.**

At 60 fps you have 16 ms per frame. A synchronous wasm call on the main thread cannot be interrupted, so anything past a frame or two shows up as a dropped frame, a stuck animation or a button that does not respond. A `fib(40)` in the example module takes about 240 ms in Chromium; that is a quarter of a second of completely frozen page.

Note what this is *not* about. Moving to wasm buys you speed, not responsiveness. Measured in the demo below, the TinyGo build of naive recursive `fib` runs roughly **2.8× faster** than the same algorithm in JIT-compiled JavaScript — a real win, but `fib(40)` still blocks the page for 240 ms if you run it on the main thread. Only the worker hook fixes that.

Use `useWasm` when calls are short and you want the result during render. Use `useWasmWorker` when they are not. Both can point at the same URL; the compiled module is cached and shared between them.

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

[`examples/go/math.go`](examples/go/math.go) is a small TinyGo module built for `wasm-unknown`, which produces a module with no WASI imports:

```sh
tinygo build -target=wasm-unknown -no-debug -o math.wasm .
```

It exports `add`, `fib`, `countPrimes`, `scale` and `logSum` (which calls back into the host via the `env.log` import), plus the `_initialize` TinyGo adds for you.

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
pnpm build:wasm    # rebuild examples/go/math.go with TinyGo
pnpm test:browser  # Playwright against the demo in real Chromium
```

The demo at [`examples/react-demo`](examples/react-demo) is built around a head-to-head benchmark. Each hook gets a panel that runs the same naive recursive `fib` twice, once in JavaScript and once in the TinyGo module, and reports both timings:

- **`useWasm` panel** — both run on the main thread, one after the other. The frame counter in the header stalls for both, which is the point: wasm is faster, not non-blocking.
- **`useWasmWorker` panel** — the wasm side uses `useWasmWorker`, the JavaScript side a plain module worker with the same message shape, so the only variable is the language. The frame counter keeps climbing throughout, and there is a Cancel button that kills both workers mid-run and restarts them.
- **Imports panel** — `imports` on the main thread, `importsUrl` in the worker.

Both sides are warmed up before timing, otherwise an un-JITted first call to the JavaScript version would lose by a mile and the comparison would mean nothing.

Measured in Chromium on an M-series Mac, for reference:

| n  | JavaScript | WebAssembly |
| -- | ---------- | ----------- |
| 35 | 64 ms      | 22 ms       |
| 38 | 267 ms     | 95 ms       |
| 40 | 687 ms     | 239 ms      |
| 42 | 1738 ms    | 624 ms      |

Your numbers will differ. The ratio holds up better than the absolute figures.

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

Adds `terminate()` to the result. `call` returns a Promise.

### Also exported

`clearWasmCache(url?)`, `WASM_WORKER_SOURCE`, and the types `UseWasmOptions`, `UseWasmResult`, `UseWasmState`, `UseWasmHelpers`, `UseWasmWorkerOptions`, `UseWasmWorkerResult`, `UseWasmWorkerState`, `UseWasmWorkerHelpers`, `WasmFunctionKeys`.

---

## License

MIT
