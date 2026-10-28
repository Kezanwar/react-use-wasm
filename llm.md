# react-use-wasm

Context for an LLM helping someone use this package. Everything here is
verified against the source, not inferred.

## What it is

Two typed React hooks for loading a WebAssembly module and calling its
exports. No runtime dependencies. React 18 or 19 as the only peer
dependency. Ships ESM and CJS with a `"use client"` banner, so it works
unchanged in the Next.js App Router. SSR-safe: nothing touches `window`
during render.

```sh
npm install react-use-wasm
```

## Choosing a hook

- `useWasm` runs the module on the main thread. `call` is synchronous, so
  the result can be used straight in a render body.
- `useWasmWorker` runs the same module in a Web Worker. `call` returns a
  Promise and the main thread stays free.

Rule of thumb: **if a single call takes longer than about 50 ms, use
`useWasmWorker`.** Moving to wasm buys speed, not responsiveness. A
synchronous wasm call cannot be interrupted, so a 240 ms call freezes the
page for 240 ms whatever language it is written in.

Both hooks can point at the same URL. Compiled modules are cached by URL and
shared between them, so a second component pays instantiation only.

## useWasm

```tsx
import { useWasm } from "react-use-wasm";

interface MathExports {
  memory: WebAssembly.Memory;
  add(a: number, b: number): number;
  fib(n: number): number;
}

function Calculator() {
  const { status, isReady, exports, error, call, reload } =
    useWasm<MathExports>("/math.wasm");

  if (status === "error") return <p>{error.message}</p>;
  if (!isReady) return <p>Loading…</p>;

  return <p>{exports.add(2, 3)}</p>;   // or call("add", 2, 3)
}
```

State is a discriminated union:

```ts
type UseWasmState<T> =
  | { status: "idle";    isReady: false; exports: null; error: null }
  | { status: "loading"; isReady: false; exports: null; error: null }
  | { status: "ready";   isReady: true;  exports: T;    error: null }
  | { status: "error";   isReady: false; exports: null; error: Error };
```

`isReady` has a literal type in each branch, so it is a second discriminant
alongside `status`. Either guard narrows `exports` from `T | null` to `T`,
and that holds after destructuring.

Options: `imports`, `cache` (default true), `fetchInit`, `allocator`.
`imports` is read once when loading starts; changing it later does not
reload, so call `reload()` if new imports must be applied.

Pass `null` as the URL to skip loading entirely. That is how you make
loading conditional without breaking the rules of hooks.

`call` only reaches **function** exports: `call("memory")` is a compile
error. Use `exports.memory` for the memory itself. `_initialize` is
excluded on purpose, because the hook already ran it.

## useWasmWorker

```tsx
const { status, isReady, error, call, reload, terminate } =
  useWasmWorker<MathExports>("/math.wasm", {
    importsUrl: "/wasm-imports.js",
  });

const value = await call("fib", 40);   // Promise<number>
```

Differences from `useWasm`:

- There is no `exports` field. The instance lives in the worker and never
  crosses back, so `call` is the only way in.
- **Arguments and results must be numbers or bigints.** They cross by
  structured clone and are then applied straight to the wasm export, so a
  typed array arrives as `NaN`, not as an array.
- There is no `withScope`. A `WebAssembly.Memory` is not
  structured-cloneable, so the memory layer below does not apply here. To
  pass larger values to a worker today, write your own worker with the
  `workerUrl` option and do the allocation inside it.
- `terminate()` kills the worker and rejects every pending call. It is the
  only way to cancel a running computation, since wasm has no interrupt.
  Follow it with `reload()` to get a fresh worker.
- `imports` is replaced by `importsUrl`, because functions cannot be posted
  to a worker. The URL must point at a plain ES module, served as-is rather
  than bundled, whose default export is the import object or an (async)
  function returning one.
- `workerUrl` overrides the inline `blob:` worker, for a CSP that blocks
  blob workers. Write `WASM_WORKER_SOURCE` out as a file and point at it.

## Typing the exports

The interface passed as `T` is what types both `call` and `exports`.

- `i32`, `f32` and `f64` are all `number` in JS.
- **`i64` is a `bigint`**, as an argument and as a return value. Declaring
  it as `number` gives silently wrong arithmetic.
- Declare only what you use. Undeclared exports are invisible to `call`.
- Nothing validates the interface against the real binary at runtime, so it
  is worth a test that instantiates the module and checks each export.

## Passing more than numbers (useWasm only)

A wasm function only takes and returns numbers. Anything larger travels as
an offset into `exports.memory.buffer`, which both sides can read and write.
This is opt-in: a module with no allocator is unaffected.

The module must export an allocator. Declare the contract and `withScope`
becomes callable:

```ts
import type { WasmAllocator } from "react-use-wasm";

interface MemoryExports extends WasmAllocator {
  sumInt32(ptr: number, len: number): number;
  sortInt32(ptr: number, len: number): void;
}
```

`WasmAllocator` is `{ memory, alloc(size): number, free(ptr): void }`. If
the toolchain names them differently, pass
`{ allocator: { alloc: "malloc", free: "free" } }` rather than renaming the
exports. Emscripten ships `malloc`/`free`.

```tsx
const { exports, withScope } = useWasm<MemoryExports>("/memory.wasm");

const { total, sorted } = withScope((s) => {
  const xs = s.i32ArrayArg([5, 3, 9, 1, 7]);      // alloc + write

  const total = exports.sumInt32(xs.ptr, xs.len);
  exports.sortInt32(xs.ptr, xs.len);              // mutates in place

  return { total, sorted: [...xs.read()] };       // read() copies out
});                                               // freed here, even on a throw
```

Scope helpers, all returning a `WasmBlock` with `ptr`, `len`, `byteLength`
and `read()`:

| helper | note |
| --- | --- |
| `s.stringArg(text)` | UTF-8 encodes; `len` is **bytes** |
| `s.bytesArg(u8)` | |
| `s.i32ArrayArg(xs)` | accepts an array or a typed array |
| `s.f64ArrayArg(xs)` | |
| `s.bytesOut(bytes)` | empty space for wasm to write into |
| `s.i32ArrayOut(len)` | |
| `s.f64ArrayOut(len)` | |
| `s.alloc(bytes)` | raw reservation |

Rules that matter:

- **The `withScope` body must be synchronous.** An async body returns a
  pending promise, the scope frees immediately, and the work then runs
  against released memory. The library throws rather than allowing it.
- `alloc` wants **bytes**; wasm functions usually want an **element count**.
  Those differ by 4 for `Int32Array` and 8 for `Float64Array`. The helpers
  size the allocation for you, which is the main reason to use them.
- A string's byte length is not its character count. `"héllo"` is five
  characters and six bytes.
- **Never cache a typed-array view.** `memory.grow()` detaches the old
  `ArrayBuffer` and every view onto it silently becomes zero-length. Take a
  fresh view every time; `read()` copies rather than returning a view.

### Returning something of unknown length

Wasm returns one value, so a function handing back freshly allocated data
usually packs `(offset, length)` into a single `i64`, which arrives in JS as
a `bigint`. `0n` is the conventional failure signal.

```ts
import { stringVal } from "react-use-wasm";

const reversed = withScope((s) => {
  const text = s.stringArg("hello wasm");
  return stringVal(exports, exports.reverseString(text.ptr, text.len));
});  // string | null
```

`stringVal` and `bytesVal` read the block and free it. Only use them on data
the module freshly allocated: they call `free`, so a pointer into static
data would be freed wrongly.

The other convention is an out-pointer: reserve the space with `s.*Out(n)`
and pass its `ptr` as an extra argument. That is what the C ABI does, and
what a Rust or C module is more likely to use than the packed `i64`.

## The `_initialize` convention

Modules built as libraries rather than commands (WASI "reactors", TinyGo's
`wasm-unknown` target) export `_initialize` and trap if any other export is
called first. Both hooks run it automatically once, before reporting ready,
and exclude it from `call` at the type level. Never call it yourself.

## Toolchains

Works: TinyGo (`tinygo build -target=wasm-unknown -no-debug`), Rust
`wasm32-unknown-unknown` with `#[no_mangle] extern "C"`, C/clang with
`--target=wasm32`, hand-written `.wat`, AssemblyScript.

Poor fit: **wasm-bindgen** and **Emscripten**, because both ship their own
JS glue that already does the loading and marshalling. Use their glue
instead; this library has nothing to add.

Does not work: standard Go with `GOOS=js GOARCH=wasm`. It exports nothing
callable and needs the `wasm_exec.js` runtime shim.

Known gap: Rust's allocator needs the original `Layout` to deallocate, so
its conventional export is `dealloc(ptr, len)` rather than `free(ptr)`. The
`WasmAllocator` contract cannot express that yet, so a Rust module needs a
`free(ptr)` wrapper of its own to use the memory layer.

## Serving the .wasm file

Serve it as `Content-Type: application/wasm` and the hooks use
`WebAssembly.compileStreaming`. If the host sends the wrong type they fall
back to `compile(arrayBuffer)` rather than failing, so a wrong MIME type
costs performance, not correctness.

Under a Content-Security-Policy, wasm compilation needs
`script-src 'wasm-unsafe-eval'`, and the default inline worker needs
`worker-src blob:`. Use `workerUrl` if blob workers are blocked.

## Full export list

Hooks: `useWasm`, `useWasmWorker`.

Memory: `withScope`, `stringVal`, `bytesVal`, `unpack`, `memorySize`,
`resolveAllocator`.

Other: `clearWasmCache(url?)`, `WASM_WORKER_SOURCE`.

Types: `UseWasmOptions`, `UseWasmResult`, `UseWasmState`, `UseWasmHelpers`,
`UseWasmWorkerOptions`, `UseWasmWorkerResult`, `UseWasmWorkerState`,
`UseWasmWorkerHelpers`, `WasmFunctionKeys`, `ScopeRunner`, `WasmAllocator`,
`AllocatorNames`, `WasmScope`, `WasmBlock`.
