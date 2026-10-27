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
`github.com/kezanwar/react-use-wasm`, which does not exist yet.

---

## Commands

Run all of these from the repo root.

| command | what it does |
| --- | --- |
| `pnpm dev` | builds the package, then starts the Vite demo on :5173 |
| `pnpm test` | Vitest: 59 tests, including 12 type tests via `tsc` |
| `pnpm test:watch` | same, in watch mode |
| `pnpm typecheck` | `tsc --noEmit` over `src`, `test`, `e2e` and the demo |
| `pnpm build` | tsup → `dist/` (ESM + CJS + `.d.ts` + sourcemaps) |
| `pnpm build:wasm` | rebuilds `math.wasm` with TinyGo, then audits its imports |
| `pnpm inspect:wasm` | lists imports/exports of the committed `math.wasm` |
| `pnpm test:browser` | Playwright against the demo in real Chromium |

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
  go/                  math.go + go.mod, the TinyGo source
  react-demo/          Vite + React app, consumes the package via workspace link
    public/math.wasm   committed, so the demo and tests work without TinyGo
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

## Tests

**59 Vitest tests across 6 files, plus 5 Playwright tests.**

| file | environment | covers |
| --- | --- | --- |
| `test/types.test-d.ts` | tsc | 12 type tests: wrong arg count/types, non-function exports, unknown names, `_initialize` exclusion, `Promise<T>` from the worker hook |
| `test/use-wasm.test.tsx` | jsdom | loading→ready, 404, bad bytes, `reload()`, null URL, stale load mid-flight, shared compile cache, `_initialize`, imports |
| `test/worker-protocol.test.ts` | node | `WASM_WORKER_SOURCE` run against a fake `self`: init, `_initialize`, calls, `data:`-URL imports, traps, non-function exports, calls before init |
| `test/ssr.test.tsx` | node | import-time safety, `renderToString`, plus child Node processes where `window`/`document`/`Worker`/`location`/`fetch`/`URL.createObjectURL` all throw |
| `test/math-wasm.test.ts` | node | the committed `math.wasm` against the `MathExports` interface |
| `test/dist-output.test.ts` | node | the published artefact (see Build above) |
| `e2e/demo.spec.ts` | Chromium | the real browser, below |

### What only the browser test can cover

jsdom has no `Worker`, so the Vitest worker tests run the worker *source*
against a fake `self`. That exercises the message protocol, which is the part
most likely to break, but **not**:

- the Blob-URL module worker actually starting
- structured-cloning a `WebAssembly.Module` across the thread boundary
- the main thread genuinely staying free during a long call

`pnpm test:browser` covers all three, in Chromium. It checks `fib(40)` end to
end while asserting the demo's frame counter keeps advancing, Cancel
(`terminate()` + `reload()`) mid-call and recovery afterwards, imports on both
threads, and that Vite serves `/math.wasm` as `Content-Type: application/wasm`
(which is what makes the hooks take the `compileStreaming` path).

### Not covered anywhere

- Firefox and Safari — Chromium only
- the `workerUrl` CSP escape hatch (hosting `WASM_WORKER_SOURCE` yourself)
- `fetchInit`

---

## The wasm example

[examples/go/math.go](examples/go/math.go), built with TinyGo:

```sh
tinygo build -target=wasm-unknown -no-debug -o math.wasm .
```

Install TinyGo with `brew tap tinygo-org/tools && brew install tinygo`. On this
machine that also required `brew trust tinygo-org/tools`, which is a persistent
Homebrew setting.

**The built `math.wasm` is committed**, so the demo, the tests and CI all work
without TinyGo installed. Only rerun `pnpm build:wasm` when `math.go` changes.

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
   `gh repo create kezanwar/react-use-wasm --public --source=. --push`.
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
