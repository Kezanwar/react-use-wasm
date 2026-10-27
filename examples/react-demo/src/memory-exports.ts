import type { WasmFunctionKeys } from "react-use-wasm";

/**
 * The exports of examples/go/memory, built with
 * `tinygo build -target=wasm-unknown`. Everything that is not a number.
 *
 * A separate module from math.wasm on purpose: this one is 186 kB, mostly
 * `encoding/json`, and bundling it with the benchmark cost the benchmark
 * about a third of its speed. See USAGE.md.
 *
 * It imports nothing at all.
 *
 * Checked against the real binary by test/memory-wasm.test.ts.
 */
export interface MemoryExports {
  memory: WebAssembly.Memory;
  /** TinyGo reactor init. The hooks run this for you; never call it yourself. */
  _initialize(): void;

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
  /**
   * Returns a freshly allocated string as a packed (offset, length) bigint.
   * Two values cannot come back from one wasm return, so they share an i64 —
   * which is why this is a bigint and not a number.
   */
  reverseString(ptr: number, len: number): bigint;

  /** Average n Points (two float64s each), writing the result to `out`. */
  centroid(ptr: number, n: number, out: number): void;
  /** JSON in, JSON out, both as UTF-8 in memory. Packed bigint, 0n on bad input. */
  jsonStats(ptr: number, len: number): bigint;
}

/** Runtime mirror of the callable exports, used by the test to check each one. */
export const MEMORY_FUNCTION_NAMES = [
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

type Missing = Exclude<WasmFunctionKeys<MemoryExports>, (typeof MEMORY_FUNCTION_NAMES)[number]>;
type Extra = Exclude<(typeof MEMORY_FUNCTION_NAMES)[number], WasmFunctionKeys<MemoryExports>>;
type Assert<_T extends never> = true;
export type NamesAreExhaustive = Assert<Missing> & Assert<Extra>;
