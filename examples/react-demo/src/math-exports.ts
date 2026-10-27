import type { WasmFunctionKeys } from "react-use-wasm";

/**
 * The exports of examples/go, built with
 * `tinygo build -target=wasm-unknown`.
 *
 * This interface is the whole point: it is what gives `call` and `exports`
 * their types. It is checked against the real module by
 * test/math-wasm.test.ts.
 *
 * TinyGo also emits a few runtime helpers (fminimum, syscall.seek, …) that
 * we simply don't declare; undeclared exports are invisible to `call`.
 *
 * Note on widths: int32 and float64 both arrive in JS as `number`. An int64
 * is a `bigint` — see reverseString and jsonStats, which pack an
 * (offset, length) pair into one.
 */
export interface MathExports {
  memory: WebAssembly.Memory;
  /** TinyGo reactor init. The hooks run this for you; never call it yourself. */
  _initialize(): void;

  /* numbers in, numbers out (math.go) */
  add(a: number, b: number): number;
  fib(n: number): number;
  countPrimes(limit: number): number;
  scale(x: number, k: number): number;
  /** Calls back into the host through the `env.log` import. */
  logSum(a: number, b: number): number;

  /* the linear-memory protocol (memory.go) */
  /** Reserve `size` bytes, returning the offset to write them at. */
  alloc(size: number): number;
  /** Release a block from alloc. */
  free(ptr: number): void;

  /** Sum an Int32Array living at (ptr, len). */
  sumInt32(ptr: number, len: number): number;
  /** Sort an Int32Array in place: read the same bytes back to see it. */
  sortInt32(ptr: number, len: number): void;
  /** Multiply a Float64Array in place. */
  scaleFloat64(ptr: number, len: number, k: number): void;

  /** Uppercase ASCII bytes in place. */
  upperInPlace(ptr: number, len: number): void;
  /** Returns a freshly allocated string as a packed (offset, length) bigint. */
  reverseString(ptr: number, len: number): bigint;

  /** Average n Points (two float64s each), writing the result to `out`. */
  centroid(ptr: number, n: number, out: number): void;
  /** JSON in, JSON out, both as UTF-8 in memory. Packed bigint, 0n on bad input. */
  jsonStats(ptr: number, len: number): bigint;
}

/** Runtime mirror of the callable exports, used by the test to check each one. */
export const MATH_FUNCTION_NAMES = [
  "add",
  "fib",
  "countPrimes",
  "scale",
  "logSum",
  "alloc",
  "free",
  "sumInt32",
  "sortInt32",
  "scaleFloat64",
  "upperInPlace",
  "reverseString",
  "centroid",
  "jsonStats",
] as const;

/**
 * Compile-time proof that MATH_FUNCTION_NAMES covers exactly the callable
 * exports of MathExports, so the runtime test can't silently miss one.
 * `_initialize` is absent from both sides: WasmFunctionKeys excludes it.
 */
type Missing = Exclude<WasmFunctionKeys<MathExports>, (typeof MATH_FUNCTION_NAMES)[number]>;
type Extra = Exclude<(typeof MATH_FUNCTION_NAMES)[number], WasmFunctionKeys<MathExports>>;
type Assert<_T extends never> = true;
export type NamesAreExhaustive = Assert<Missing> & Assert<Extra>;
