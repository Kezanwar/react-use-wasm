#!/usr/bin/env sh
# Rebuilds the example wasm module from examples/go.
# Requires TinyGo: https://tinygo.org/getting-started/install/
#   macOS: brew tap tinygo-org/tools && brew install tinygo
#
# The built math.wasm is committed, so the demo and tests run without TinyGo.
set -e

if ! command -v tinygo >/dev/null 2>&1; then
  echo "tinygo not found. Install it: https://tinygo.org/getting-started/install/" >&2
  exit 1
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/examples/react-demo/public/math.wasm"

echo "building $OUT"
(cd "$ROOT/examples/go" && tinygo build -target=wasm-unknown -no-debug -o "$OUT" .)

# wasm-unknown must produce no WASI imports; env.log is ours, from the demo.
node "$ROOT/scripts/inspect-wasm.mjs" "$OUT" --allow-imports env.log
