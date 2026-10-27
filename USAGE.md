# USAGE — maintainer notes

Operational notes for working on this repo. The user-facing package docs are
in [README.md](README.md); this file is about building, testing, releasing and
the decisions that are easy to undo by accident.

---

## What this is

| | |
| --- | --- |
| **npm package** | `react-use-wasm` |
| **version** | 0.1.0 (unpublished) |
| **license** | MIT |
| **repo** | local only, one commit on `main`, no remote yet |
| **package manager** | pnpm 11 (workspace: root package + `examples/react-demo`) |

`use-wasm` was already taken on npm (v0.0.3, published by raphamorim over a
year ago), hence the `react-use-wasm` name. The three GitHub URLs in
`package.json` (`repository`, `homepage`, `bugs`) point at
`github.com/Kezanwar/react-use-wasm`, which does not exist yet.

---

## Commands

Run all of these from the repo root.

| command | what it does |
| --- | --- |
| `pnpm dev` | builds the package, then starts the Vite demo on :5173 |
| `pnpm test` | Vitest: 59 tests, including 12 type tests via `tsc` |
| `pnpm test:watch` | same, in watch mode |
| `pnpm typecheck` | `tsc --noEmit` over the package, then the demo's own tsconfig |
| `pnpm build` | tsup → `dist/` (ESM + CJS + `.d.ts` + sourcemaps) |
| `pnpm build:wasm` | rebuilds `math.wasm` with TinyGo, then audits its imports |
| `pnpm inspect:wasm` | lists imports/exports of the committed `math.wasm` |
| `pnpm test:browser` | Playwright: the demo in real Chromium, plus a sub-directory deploy |

**Order matters for `pnpm test`.** Two suites assert things about the built
bundles (`test/dist-output.test.ts` and the hostile-globals part of
`test/ssr.test.tsx`). They skip cleanly if `dist/` is missing, so run
`pnpm build` first if you want the full suite. CI does exactly that.

---

## Layout

```
src/
  use-wasm.ts          hook + shared loader/cache + public types
  use-wasm-worker.ts   worker hook + WASM_WORKER_SOURCE
  index.ts             public exports
test/
  fixtures/*.wat       readable wasm fixtures, compiled at test time by wabt
  helpers/wat.ts       .wat -> bytes, plus the path to the built math.wasm
e2e/                   Playwright specs (real browser only)
examples/
  go/                  two separate main packages, two separate .wasm files
    math/math.go       numbers in, numbers out                         -> math.wasm,   1.1 kB
    memory/memory.go   alloc/free, arrays, strings, structs, JSON      -> memory.wasm, 186 kB
  react-demo/          Vite + React + Tailwind v4 + shadcn/ui, linked via the workspace
    public/math.wasm           committed, so the demo and tests work without TinyGo
    public/memory.wasm         likewise; only the Examples tab fetches it
    public/js-fib-worker.js    the JavaScript side of the worker benchmark
    src/pages/                 one per tab: Benchmarks, Examples
    src/panels/                the three Benchmarks panels
    src/examples/              the three Examples cards
    src/lib/wasm-memory.ts     the JS half of the linear-memory protocol
    src/fib.ts                 the JavaScript side of the main-thread benchmark
    src/useJsWorker.ts         demo-only hook, shaped like useWasmWorker
scripts/
  build-wasm.sh        TinyGo build + import audit
  inspect-wasm.mjs     stands in for `wasm-objdump -x`, no wabt install needed
```

---

## Build

tsup, configured in [tsup.config.ts](tsup.config.ts).

**`treeshake` is off on purpose. Do not turn it on.** tsup's treeshake pass is
rollup, and rollup strips module-level directives — it silently dropped the
`"use client"` banner, with only a warning in the build log. Without that
directive the package breaks in the Next.js App Router. The package is ~9 kB
and marked `sideEffects: false`, so consumer bundlers tree-shake it fine
anyway. `test/dist-output.test.ts` asserts the directive is line 1 of both
`dist/index.js` and `dist/index.cjs`, so this cannot regress unnoticed.

Other fixed points, all asserted by that same test file:

- `react` stays external (peer dependency, `>=18`); there are no runtime deps
- `sideEffects: false`, `files: ["dist"]`
- both `.d.ts` and `.d.cts` ship, for ESM and CJS type resolution

---

## Why `isReady` lives in the state union

`isReady` is not computed on the way out. It is a field of `UseWasmState` /
`UseWasmWorkerState` with a **literal** type per branch — `true` in `ready`,
`false` everywhere else.

**Do not "simplify" it back to `isReady: boolean` in the helpers.** The literal
types are what make it a second discriminant alongside `status`, so this
narrows:

```tsx
const { isReady, exports } = useWasm<MathExports>("/math.wasm");
if (!isReady) return null;
exports.add(2, 3);   // exports is MathExports here, not MathExports | null
```

With a derived `boolean` that last line is `'exports' is possibly null`, and
`call` becomes the only ergonomic way to reach the module on the main thread.
TypeScript enforces the correlation now that it is in the union, and
`test/types.test-d.ts` has five tests pinning the narrowing in both
directions, on both hooks.

Related: `call` is genuinely load-bearing for `useWasmWorker` (it is the RPC
over `postMessage`) but optional for `useWasm`, where `exports` is right there
and reaches `memory`, globals and tables that `call` cannot. The README
section "`call` or `exports`?" is the user-facing version of this.

---

## Tests

**59 Vitest tests across 6 files, plus 5 Playwright tests.**

| file | environment | covers |
| --- | --- | --- |
| `test/types.test-d.ts` | tsc | 12 type tests: wrong arg count/types, non-function exports, unknown names, `_initialize` exclusion, `Promise<T>` from the worker hook |
| `test/use-wasm.test.tsx` | jsdom | loading→ready, 404, bad bytes, `reload()`, null URL, stale load mid-flight, shared compile cache, `_initialize`, imports |
| `test/worker-protocol.test.ts` | node | `WASM_WORKER_SOURCE` run against a fake `self`: init, `_initialize`, calls, `data:`-URL imports, traps, non-function exports, calls before init |
| `test/ssr.test.tsx` | node | import-time safety, `renderToString`, plus child Node processes where `window`/`document`/`Worker`/`location`/`fetch`/`URL.createObjectURL` all throw |
| `test/math-wasm.test.ts` | node | the committed `math.wasm` against the `MathExports` interface |
| `test/memory-wasm.test.ts` | node | the committed `memory.wasm` against `MemoryExports`, and every step of the linear-memory protocol |
| `test/dist-output.test.ts` | node | the published artefact (see Build above) |
| `e2e/demo.spec.ts` | Chromium | the real browser, below |
| `e2e/subpath.spec.ts` | Chromium | the production build served from a sub-directory, the way GitHub Pages does |

### What only the browser test can cover

jsdom has no `Worker`, so the Vitest worker tests run the worker *source*
against a fake `self`. That exercises the message protocol, which is the part
most likely to break, but **not**:

- the Blob-URL module worker actually starting
- structured-cloning a `WebAssembly.Module` across the thread boundary
- the main thread genuinely staying free during a long call

`pnpm test:browser` covers all three, in Chromium — 6 specs. It runs both
benchmark panels end to end and asserts the two implementations agree on the
answer, that the frame counter keeps advancing during the worker run, that
Cancel (`terminate()` + `reload()`) kills a call mid-flight and both workers
come back, that imports work on both threads, and that Vite serves
`/math.wasm` as `Content-Type: application/wasm` (which is what makes the
hooks take the `compileStreaming` path).

### The demo is a benchmark

Each hook's panel runs the same naive recursive `fib` twice, in JavaScript and
in the TinyGo module, and shows both timings. Two things to preserve if you
change it:

1. **Both sides are warmed up at n = 24 before timing.** Without that, the
   first JavaScript call is un-JITted and loses by a mile, which would make
   the comparison a lie.
2. **The two runs are sequential, not parallel**, so they are not competing
   for cores.

Measured in Chromium on an M-series Mac: wasm comes out roughly **2.8–3.3×**
faster. That is the honest number — this is not a 10× story, and the UI
computes the ratio at runtime rather than claiming one.

### Not covered anywhere

- Firefox and Safari — Chromium only
- the `workerUrl` CSP escape hatch (hosting `WASM_WORKER_SOURCE` yourself)
- `fetchInit`

---

## The wasm example

[examples/go](examples/go), two packages, built with TinyGo:

```sh
tinygo build -target=wasm-unknown -no-debug -o math.wasm .
```

Install TinyGo with `brew tap tinygo-org/tools && brew install tinygo`. On this
machine that also required `brew trust tinygo-org/tools`, which is a persistent
Homebrew setting.

**The built `math.wasm` is committed**, so the demo, the tests and CI all work
without TinyGo installed. Only rerun `pnpm build:wasm` when the Go changes.

Two things to remember if you touch it:

1. **TinyGo's `wasm-unknown` output traps if you call any export before
   `_initialize`.** Not a theoretical WASI nicety — `add(2, 3)` on a fresh
   instance throws `RuntimeError: unreachable`. Both hooks call `_initialize`
   before reporting `ready`, and `test/math-wasm.test.ts` pins the trap so the
   reason stays documented.
2. **Update `MathExports` alongside it.**
   [examples/react-demo/src/math-exports.ts](examples/react-demo/src/math-exports.ts)
   has a `MATH_FUNCTION_NAMES` const with a compile-time exhaustiveness check
   against the interface, and `test/math-wasm.test.ts` checks both against the
   real binary. Adding an export without updating the interface fails the type
   check; updating the interface without the runtime list fails too.

`pnpm build:wasm` ends with an import audit that **fails if anything other than
`env.log` appears**. That is the guard against a build accidentally pulling in
WASI imports, which would make the module unusable with these hooks.

TinyGo also emits a handful of runtime helpers (`fminimum`, `fmaximumf`, …).
They are harmless and simply not declared in `MathExports`.

---

## Why there are two wasm modules

`math.wasm` is 1.1 kB and `memory.wasm` is 186 kB, built from two separate
`main` packages. **Do not merge them.**

They were one module briefly, and the fib benchmark dropped from about 2.9x
faster than JavaScript to about 1.7x. The cause is not the Go code and not
the download:

- The `fib` **bytecode is byte-for-byte identical** in both builds. Only the
  function index differs. Verified by disassembling with `wabt`.
- A 20 kB build (memory exports, no `encoding/json`) is **exactly as slow as
  the 186 kB one**, so it is not proportional to size either.

It is V8's compilation tiers. Chromium compiles wasm with Liftoff (quick to
compile, slow code) and then re-compiles hot functions with TurboFan. Forcing
each tier makes every module identical, which is the proof:

| `--js-flags=` | 1.1 kB | 20 kB | 186 kB |
| --- | --- | --- | --- |
| `--liftoff-only` | 1.11x | 1.14x | 1.13x |
| *(default)* | **3.07x** | 1.80x | 1.78x |
| `--no-liftoff` | 2.81x | 2.74x | 2.78x |

Only the tiny module reaches the top tier under the default heuristics. The
confirming detail: `--no-wasm-dynamic-tiering` drags the 1.1 kB module down
to 1.74x, matching the others, so the fast number was specifically a
dynamic-tiering effect that only a very small module gets.

The threshold sits somewhere between 1.1 kB and 20 kB. These flags do not
expose exactly where, and it is a V8 heuristic that can change between
versions.

**Practical consequence, and the reason this is written down:** a wasm
micro-benchmark measures your module's size as much as your code. Keep the
module under test minimal, or force the tier, or you are measuring V8's
compilation policy.

Reproduce it with `pnpm exec playwright test`, adding a spec that launches
`chromium.launch({ args: ["--js-flags=--no-liftoff"] })`.

---

## Demo styling

Tailwind v4 through `@tailwindcss/vite`, so there is **no `tailwind.config.js`** —
the theme lives in `@theme inline` at the top of `src/styles.css`. shadcn/ui
components sit in `src/components/ui/` and are ordinary source files you can
edit; `components.json` tells the CLI where to put new ones
(`pnpm dlx shadcn@latest add <name>` from `examples/react-demo`).

Three colours carry meaning and should never be used decoratively:

| token | colour | means |
| --- | --- | --- |
| `--js` | gold | the JavaScript side of anything |
| `--wasm` | violet | the WebAssembly side (its brand colour) |
| `--code` | orange | an identifier you could type |

Write the first two with the `<Js />` and `<Wasm />` components in
`src/components/Term.tsx` rather than typing the words, so the mapping cannot
drift. `--code` is applied globally to `code` in `@layer base`, with
`pre code` opting back out — a code block set entirely in orange is
unreadable, and its own `CodeBlock` chrome already marks it as code.

`--js` and `--code` are deliberately far apart in hue (gold at ~85, orange at
~45). Earlier they were both amber and read as the same thing.

`cn` comes from the npm package of that name, published by the shadcn org,
rather than a local `src/lib/utils.ts`. That is what the current CLI
generates.

### Syntax highlighting

`prism-react-renderer` is handed a **deliberately empty theme**, so it emits
token classNames and no inline styles. All colour lives in the
`.code-block .token.*` rules in `src/styles.css`, which means the blocks use
the page palette and follow dark mode with no extra work.

**Rule order in that block matters and is commented as such.** Prism puts
several classes on one token — a method call is
`method function property-access` — and the rules are all single-class, so
equal specificity means the last one wins. Least specific meaning first,
most specific last. Putting `property-access` after `function` silently
turns every method call plain.

It costs about 134 kB raw / 41 kB gzipped of the demo bundle, which is more
than it sounds like it should; `prism-react-renderer` v2 bundles Prism with
a fixed language set and cannot be subset. Acceptable here because the demo
is not published anywhere. Swap it for a small hand-rolled tokenizer if that
ever changes.

---

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml), on push to `main` and on
every PR. Two jobs:

- **check** — install → `typecheck` → `build` → `test` → `inspect:wasm`
- **e2e** — install → download Chromium → `test:browser` (uploads the
  Playwright report as an artifact on failure)

They are separate so a browser-download hiccup cannot mask a unit test failure.

No linter. `tsc --strict` plus `noUnusedLocals` / `noUnusedParameters` covers
the usual ground; add ESLint if you want more.

---

## Deploying the demo

GitHub Pages, via [.github/workflows/pages.yml](.github/workflows/pages.yml),
on every push to `main` or by manual dispatch. Live at
<https://kezanwar.github.io/react-use-wasm/>.

**Two things need doing by hand, once:**

1. **Settings → Pages → Source → GitHub Actions.** The workflow fails until
   this is set; it cannot be done from a workflow.
2. Nothing else. There is no `NPM_TOKEN` equivalent and no `.nojekyll`
   needed, because an Actions deploy skips Jekyll entirely.

### Never write an absolute asset path

Pages serves the demo from `/react-use-wasm/`, not `/`. A path like
`"/math.wasm"` points at the domain root, works perfectly in dev, and 404s
in production.

`vite.config.ts` sets `base: "./"` and everything in `public/` goes through
`asset()` in [src/lib/asset.ts](examples/react-demo/src/lib/asset.ts):

```ts
useWasm<MathExports>(asset("math.wasm"))
useWasmWorker<MathExports>(asset("math.wasm"), { importsUrl: asset("wasm-imports.js") })
```

A relative base rather than a hard-coded `/react-use-wasm/` means dev,
`vite preview`, the Playwright suite and Pages all work off one setting, and
nothing breaks if the repo is renamed.

`e2e/subpath.spec.ts` runs the real production build against
[scripts/serve-subpath.mjs](scripts/serve-subpath.mjs), which mimics Pages,
and fails on any 404 or page error. It also serves `.wasm` as the wrong MIME
type in a second pass, proving the hooks fall back from `compileStreaming`
to `compile(arrayBuffer)` if Pages ever gets that header wrong. Both are
covered by `pnpm test:browser`.

---

## Publishing

### First publish, from your machine

```sh
npm login
pnpm build && pnpm test     # prepublishOnly does this too
npm pack --dry-run          # sanity-check the file list
npm publish --access public
```

**Do not pass `--provenance` locally — it will fail.** Provenance needs GitHub
Actions OIDC, so that flag belongs only in the workflow.

Current pack output: **9 files, 18.1 kB tarball, 97.3 kB unpacked** —
`dist/` (6 files), `LICENSE`, `README.md`, `package.json`. Sourcemaps are about
48 kB of the unpacked size; set `sourcemap: false` in `tsup.config.ts` to
roughly halve it, at the cost of debuggability.

### Releasing from CI afterwards

[.github/workflows/publish.yml](.github/workflows/publish.yml) runs when you
publish a **GitHub release**. Prerequisites:

1. **Create the repo and push.** `brew install gh`, `gh auth login`, then
   `gh repo create Kezanwar/react-use-wasm --public --source=. --push`.
2. **Add the npm token.** On npmjs.com: Access Tokens → Generate New Token →
   **Granular**, read + write on `react-use-wasm`. Then in GitHub:
   **Settings → Secrets and variables → Actions → New repository secret**,
   named exactly **`NPM_TOKEN`**.
3. **Tag the release `v<version>`**, e.g. `v0.1.0`. The workflow refuses to
   publish if the tag does not match `package.json`.

The workflow runs `typecheck`, `build` and `test`, then
`npm publish --provenance --access public`. `prepublishOnly` re-runs build and
test as a final gate.

---

## Decisions you might want to revisit

| decision | why | how to change |
| --- | --- | --- |
| `treeshake: false` | rollup strips the `"use client"` banner | don't, unless you move the directive into `dist` another way |
| sourcemaps published | debuggability, ~48 kB of the tarball | `sourcemap: false` in `tsup.config.ts` |
| no linter | `tsc --strict` covers most of it | add ESLint + a `lint` step to `ci.yml` |
| `.wat` fixtures compiled at test time | reviewable text, no committed test binaries, no toolchain in CI | the `wabt` devDependency is what makes this work |
| `math.wasm` committed | demo and CI work without TinyGo | it is ~1.2 kB; keep it |
| Chromium only in e2e | speed | add browsers to `projects` in `playwright.config.ts` |
