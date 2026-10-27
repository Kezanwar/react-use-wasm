#!/usr/bin/env sh
# Rebuilds both example wasm modules from examples/go.
# Requires TinyGo: https://tinygo.org/getting-started/install/
#   macOS: brew tap tinygo-org/tools && brew install tinygo
#
# Both built files are committed, so the demo and tests run without TinyGo.
#
# They are two modules on purpose. V8 only top-tiers a wasm module while it
# is small, so the benchmark loses about a third of its speed if the heavy
# linear-memory code is bundled in with it. See USAGE.md.
set -e

if ! command -v tinygo >/dev/null 2>&1; then
  echo "tinygo not found. Install it: https://tinygo.org/getting-started/install/" >&2
  exit 1
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PUBLIC="$ROOT/examples/react-demo/public"

build() {
  pkg=$1
  out=$2
  echo "building $out"
  (cd "$ROOT/examples/go" && tinygo build -target=wasm-unknown -no-debug -o "$PUBLIC/$out" "./$pkg")
}

build math math.wasm
build memory memory.wasm

echo
# wasm-unknown must produce no WASI imports. env.log is ours, from the demo.
node "$ROOT/scripts/inspect-wasm.mjs" "$PUBLIC/math.wasm" --allow-imports env.log
echo
# The memory module imports nothing at all.
node "$ROOT/scripts/inspect-wasm.mjs" "$PUBLIC/memory.wasm"
