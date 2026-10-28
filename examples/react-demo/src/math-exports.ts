import type { WasmFunctionKeys } from "react-use-wasm";

/**
 * The exports of examples/go/math, built with
 * `tinygo build -target=wasm-unknown`. Numbers in, numbers out.
 *
 * This interface is what gives `call` and `exports` their types. It is
 * checked against the real binary by test/math-wasm.test.ts.
 *
 * Deliberately small: see src/memory-exports.ts for the other module, and
 * USAGE.md for why the two are not one.
 *
 * TinyGo also emits a few runtime helpers (fminimum, fmaximumf, …) that we
 * simply don't declare; undeclared exports are invisible to `call`.
 *
 * Note on widths: int32 and float64 both arrive in JS as `number`.
 */
export interface MathExports {
  memory: WebAssembly.Memory;
  /** TinyGo reactor init. The hooks run this for you; never call it yourself. */
  _initialize(): void;

  add(a: number, b: number): number;
  fib(n: number): number;
  countPrimes(limit: number): number;
  scale(x: number, k: number): number;
  /** Calls back into the host through the `env.log` import. */
  logSum(a: number, b: number): number;
}

/** Runtime mirror of the callable exports, used by the test to check each one. */
export const MATH_FUNCTION_NAMES = ["add", "fib", "countPrimes", "scale", "logSum"] as const;

/**
 * Compile-time proof that the list covers exactly the callable exports, so
 * the runtime test can't silently miss one. `_initialize` is absent from
 * both sides: WasmFunctionKeys excludes it.
 */
type Missing = Exclude<WasmFunctionKeys<MathExports>, (typeof MATH_FUNCTION_NAMES)[number]>;
type Extra = Exclude<(typeof MATH_FUNCTION_NAMES)[number], WasmFunctionKeys<MathExports>>;
type Assert<_T extends never> = true;
export type NamesAreExhaustive = Assert<Missing> & Assert<Extra>;
