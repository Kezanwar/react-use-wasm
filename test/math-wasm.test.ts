import { describe, expect, it } from "vitest";
import {
  MATH_FUNCTION_NAMES,
  type MathExports,
} from "../examples/react-demo/src/math-exports";
import { mathWasmBytes } from "./helpers/wat";

/**
 * Checks the committed examples/react-demo/public/math.wasm against the
 * MathExports interface the demo and README are written against. If someone
 * edits the Go and rebuilds without updating the interface, this fails.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

/** Go packs an (offset, length) pair into one i64. */
const unpack = (packed: bigint) => ({
  ptr: Number(packed >> 32n),
  len: Number(packed & 0xffffffffn),
});

describe("examples/go math.wasm", () => {
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

describe("the linear-memory protocol", () => {
  it("alloc returns a usable offset and free does not throw", async () => {
    const { exports } = await ready();
    const ptr = exports.alloc(64);
    expect(ptr).toBeGreaterThan(0);
    expect(ptr + 64).toBeLessThanOrEqual(exports.memory.buffer.byteLength);
    expect(() => exports.free(ptr)).not.toThrow();
  });

  it("alloc of nothing returns a null offset", async () => {
    const { exports } = await ready();
    expect(exports.alloc(0)).toBe(0);
  });

  it("sums an Int32Array passed by offset", async () => {
    const { exports } = await ready();
    const xs = Int32Array.from([5, 3, 9, 1, 7]);
    const ptr = exports.alloc(xs.byteLength);
    new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);

    expect(exports.sumInt32(ptr, xs.length)).toBe(25);
    exports.free(ptr);
  });

  it("sorts an Int32Array in place, which JS reads back", async () => {
    const { exports } = await ready();
    const xs = Int32Array.from([5, 3, 9, 1, 7]);
    const ptr = exports.alloc(xs.byteLength);
    new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);

    exports.sortInt32(ptr, xs.length);

    expect([...new Int32Array(exports.memory.buffer, ptr, xs.length)]).toEqual([1, 3, 5, 7, 9]);
    exports.free(ptr);
  });

  it("scales a Float64Array in place", async () => {
    const { exports } = await ready();
    const xs = Float64Array.from([1.5, 2, 4]);
    const ptr = exports.alloc(xs.byteLength);
    new Float64Array(exports.memory.buffer, ptr, xs.length).set(xs);

    exports.scaleFloat64(ptr, xs.length, 2.5);

    expect([...new Float64Array(exports.memory.buffer, ptr, xs.length)]).toEqual([3.75, 5, 10]);
    exports.free(ptr);
  });

  it("uppercases a string in place", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("hello wasm");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    exports.upperInPlace(ptr, bytes.length);

    expect(decoder.decode(new Uint8Array(exports.memory.buffer, ptr, bytes.length))).toBe(
      "HELLO WASM"
    );
    exports.free(ptr);
  });

  it("returns a new string as a packed (offset, length) bigint", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("hello wasm");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    const packed = exports.reverseString(ptr, bytes.length);
    expect(typeof packed).toBe("bigint");

    const out = unpack(packed);
    expect(out.len).toBe(bytes.length);
    expect(decoder.decode(new Uint8Array(exports.memory.buffer, out.ptr, out.len))).toBe(
      "msaw olleh"
    );

    exports.free(out.ptr);
    exports.free(ptr);
  });

  it("averages a struct array through an out-pointer", async () => {
    const { exports } = await ready();
    // Four corners of a square: Point is two float64s, 16 bytes, no padding.
    const points = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]);
    const ptr = exports.alloc(points.byteLength);
    new Float64Array(exports.memory.buffer, ptr, points.length).set(points);
    const out = exports.alloc(16);

    exports.centroid(ptr, 4, out);

    expect([...new Float64Array(exports.memory.buffer, out, 2)]).toEqual([5, 5]);
    exports.free(out);
    exports.free(ptr);
  });

  it("round-trips objects as JSON", async () => {
    const { exports } = await ready();
    const json = encoder.encode(
      JSON.stringify([
        { name: "Ada", age: 36 },
        { name: "Alan", age: 41 },
        { name: "Grace", age: 45 },
      ])
    );
    const ptr = exports.alloc(json.length);
    new Uint8Array(exports.memory.buffer).set(json, ptr);

    const out = unpack(exports.jsonStats(ptr, json.length));
    const stats = JSON.parse(
      decoder.decode(new Uint8Array(exports.memory.buffer, out.ptr, out.len))
    );

    expect(stats.count).toBe(3);
    expect(stats.meanAge).toBeCloseTo(40.667, 3);
    expect(stats.oldest).toBe("Grace");

    exports.free(out.ptr);
    exports.free(ptr);
  });

  it("reports unparseable JSON as a zero packed value", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("not json");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    expect(exports.jsonStats(ptr, bytes.length)).toBe(0n);
    exports.free(ptr);
  });
});
