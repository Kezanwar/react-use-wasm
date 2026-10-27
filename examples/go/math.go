// Package main is the example wasm module used by the react-use-wasm demo
// and tests.
//
// Build with TinyGo, NOT the standard Go toolchain:
//
//	tinygo build -target=wasm-unknown -no-debug -o math.wasm .
//
// `GOOS=js GOARCH=wasm` with standard Go will not work here: it exports
// nothing callable and needs the wasm_exec.js runtime shim. The
// `wasm-unknown` target emits a plain module with no WASI imports, which is
// exactly what useWasm/useWasmWorker expect.
//
// Parameter types are explicitly int32/float64 so the JavaScript side sees
// plain numbers. int64 would arrive in JS as a bigint.
package main

// log is supplied by the host as the `env.log` import. In the demo it is
// provided by examples/react-demo/public/wasm-imports.js.
//
//go:wasmimport env log
func log(x int32)

// add is the simple demo export.
//
//go:wasmexport add
func add(a int32, b int32) int32 {
	return a + b
}

// fib is deliberately the naive recursive version: it is the slow call that
// makes useWasmWorker worth using (n around 40 takes long enough to freeze
// the main thread).
//
//go:wasmexport fib
func fib(n int32) int32 {
	if n < 2 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

// countPrimes counts primes below limit by trial division. Second heavy
// compute demo, scales smoothly with limit.
//
//go:wasmexport countPrimes
func countPrimes(limit int32) int32 {
	if limit < 3 {
		return 0
	}
	count := int32(1) // 2
	for n := int32(3); n < limit; n += 2 {
		isPrime := true
		for d := int32(3); d*d <= n; d += 2 {
			if n%d == 0 {
				isPrime = false
				break
			}
		}
		if isPrime {
			count++
		}
	}
	return count
}

// scale shows a float64 signature: both sides see plain JS numbers.
//
//go:wasmexport scale
func scale(x float64, k float64) float64 {
	return x * k
}

// logSum calls back into JavaScript through the env.log import, then returns
// the value it logged.
//
//go:wasmexport logSum
func logSum(a int32, b int32) int32 {
	sum := a + b
	log(sum)
	return sum
}

func main() {}
