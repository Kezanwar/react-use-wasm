import { describe, expect, it } from "vitest";
import {
  MATH_FUNCTION_NAMES,
  type MathExports,
} from "../examples/react-demo/src/math-exports";
import { mathWasmBytes } from "./helpers/wat";

/**
 * Checks the committed math.wasm against the MathExports interface the demo
 * and README are written against. If someone edits the Go and rebuilds
 * without updating the interface, this fails.
 *
 * The linear-memory module is a separate binary with its own test file.
 */

async function instantiate() {
  const logged: number[] = [];
  const { instance, module } = await WebAssembly.instantiate(await mathWasmBytes(), {
    env: { log: (x: number) => void logged.push(x) },
  });
  const exports = instance.exports as unknown as MathExports;
  return { exports, module, logged };
}

async function ready() {
  const handle = await instantiate();
  handle.exports._initialize();
  return handle;
}

describe("examples/go/math -> math.wasm", () => {
  it("imports only env.log, so there are no WASI requirements", async () => {
    const { module } = await instantiate();
    expect(
      WebAssembly.Module.imports(module).map((i) => `${i.module}.${i.name}`)
    ).toEqual(["env.log"]);
  });

  it("exports an _initialize, which is why the hooks call it", async () => {
    const { exports } = await instantiate();
    expect(typeof exports._initialize).toBe("function");
  });

  it("traps if an export is called before _initialize", async () => {
    // This is TinyGo's reactor contract, and the reason the hooks run
    // _initialize before reporting ready.
    const { exports } = await instantiate();
    expect(() => exports.add(2, 3)).toThrow();
  });

  it("exports every function named in MathExports", async () => {
    const { exports } = await instantiate();
    for (const name of MATH_FUNCTION_NAMES) {
      expect(typeof exports[name], `export "${name}"`).toBe("function");
    }
  });

  it("exports memory", async () => {
    const { exports } = await instantiate();
    expect(exports.memory).toBeInstanceOf(WebAssembly.Memory);
  });
});

describe("numbers in, numbers out", () => {
  it("returns correct values", async () => {
    const { exports, logged } = await ready();

    expect(exports.add(2, 3)).toBe(5);
    expect(exports.add(-4, 4)).toBe(0);

    expect(exports.fib(0)).toBe(0);
    expect(exports.fib(1)).toBe(1);
    expect(exports.fib(10)).toBe(55);
    expect(exports.fib(25)).toBe(75025);

    expect(exports.countPrimes(2)).toBe(0);
    expect(exports.countPrimes(100)).toBe(25);
    expect(exports.countPrimes(10000)).toBe(1229);

    expect(exports.scale(2.5, 4)).toBe(10);
    expect(exports.scale(0.1, 3)).toBeCloseTo(0.3, 10);

    expect(exports.logSum(40, 2)).toBe(42);
    expect(logged).toEqual([42]);
  });

  it("int32 and float64 both arrive as plain JS numbers", async () => {
    const { exports } = await ready();
    expect(typeof exports.add(1, 2)).toBe("number");
    expect(typeof exports.scale(1, 2)).toBe("number");
  });
});
