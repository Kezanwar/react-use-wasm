import { describe, expectTypeOf, it } from "vitest";
import {
  useWasm,
  useWasmWorker,
  type UseWasmResult,
  type UseWasmState,
  type WasmFunctionKeys,
} from "react-use-wasm";

interface MathExports {
  memory: WebAssembly.Memory;
  /** Reactor init. Must not be reachable through `call`. */
  _initialize(): void;
  add(a: number, b: number): number;
  fib(n: number): number;
  bigAdd(a: bigint, b: bigint): bigint;
}

declare const main: UseWasmResult<MathExports>;
declare const worker: ReturnType<typeof useWasmWorker<MathExports>>;

describe("WasmFunctionKeys", () => {
  it("is exactly the callable exports, minus _initialize", () => {
    expectTypeOf<WasmFunctionKeys<MathExports>>().toEqualTypeOf<"add" | "fib" | "bigAdd">();
  });
});

describe("useWasm().call", () => {
  it("returns the export's return type", () => {
    expectTypeOf(main.call("add", 2, 3)).toEqualTypeOf<number>();
    expectTypeOf(main.call("bigAdd", 1n, 2n)).toEqualTypeOf<bigint>();
  });

  it("rejects a wrong argument count", () => {
    // @ts-expect-error add takes two arguments
    main.call("add", 2);
    // @ts-expect-error add takes two arguments
    main.call("add", 2, 3, 4);
  });

  it("rejects wrong argument types", () => {
    // @ts-expect-error string is not assignable to number
    main.call("add", "2", 3);
    // @ts-expect-error number is not assignable to bigint
    main.call("bigAdd", 1, 2n);
  });

  it("rejects non-function exports", () => {
    // @ts-expect-error memory is a Memory, not a function
    main.call("memory");
  });

  it("rejects unknown export names", () => {
    // @ts-expect-error subtract is not an export
    main.call("subtract", 1, 2);
  });

  it("rejects _initialize, which the hook runs for you", () => {
    // @ts-expect-error _initialize is excluded from WasmFunctionKeys
    main.call("_initialize");
  });
});

describe("useWasmWorker().call", () => {
  it("returns a Promise of the export's return type", () => {
    expectTypeOf(worker.call("fib", 40)).toEqualTypeOf<Promise<number>>();
    expectTypeOf(worker.call("bigAdd", 1n, 2n)).toEqualTypeOf<Promise<bigint>>();
  });

  it("applies the same argument checks", () => {
    // @ts-expect-error fib takes one argument
    worker.call("fib");
    // @ts-expect-error string is not assignable to number
    worker.call("fib", "40");
    // @ts-expect-error memory is not a function export
    worker.call("memory");
    // @ts-expect-error not an export
    worker.call("nope", 1);
  });

  it("has no exports field (the module lives in the worker)", () => {
    // @ts-expect-error the worker hook never hands back live exports
    worker.exports;
  });
});

describe("state is a discriminated union", () => {
  it("narrows exports to T only when ready", () => {
    const state = main as UseWasmState<MathExports>;
    if (state.status === "ready") {
      expectTypeOf(state.exports).toEqualTypeOf<MathExports>();
      expectTypeOf(state.error).toEqualTypeOf<null>();
    }
    if (state.status === "error") {
      expectTypeOf(state.exports).toEqualTypeOf<null>();
      expectTypeOf(state.error).toEqualTypeOf<Error>();
    }
  });

  it("accepts a null url", () => {
    expectTypeOf(useWasm<MathExports>).toBeCallableWith(null);
    expectTypeOf(useWasmWorker<MathExports>).toBeCallableWith(null);
  });
});
